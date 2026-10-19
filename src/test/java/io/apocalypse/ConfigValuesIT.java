package io.apocalypse;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/** 参数版本与原子批量保存：版本暴露、单项可选乐观锁、批量全成或全败、缓存失效、操作日志。 */
class ConfigValuesIT extends AbstractIntegrationTest {

  @Autowired private CacheManager cacheManager;

  private String token;

  private String prefix;

  @BeforeEach
  void setUp() {
    token = loginAndGetToken("admin", ADMIN_PASSWORD);
    prefix = "it.values." + UUID.randomUUID().toString().substring(0, 8) + ".";
  }

  @AfterEach
  void cleanup() {
    jdbcTemplate.update("DELETE FROM sys_config WHERE config_key LIKE ?", prefix + "%");
  }

  @Test
  void pageExposesVersionAndBatchSaveUpdatesAllRowsAtomically() {
    long first = create("a", "1");
    long second = create("b", "2");
    JsonNode before = row(first);
    assertThat(before.get("version").isInt()).isTrue();
    int firstVersion = before.get("version").asInt();
    int secondVersion = row(second).get("version").asInt();
    // 先读入缓存，验证批量保存后整体失效。
    assertThat(getForData("/system/configs/key/" + prefix + "a", token).get("configValue").asText())
        .isEqualTo("1");

    JsonNode saved =
        putForData(
            "/system/configs/values",
            Map.of(
                "items",
                List.of(
                    Map.of("id", first, "expectedVersion", firstVersion, "configValue", "10"),
                    Map.of("id", second, "expectedVersion", secondVersion, "configValue", "20"))),
            token);

    assertThat(saved).hasSize(2);
    assertThat(saved.get(0).get("configValue").asText()).isEqualTo("10");
    assertThat(saved.get(0).get("version").asInt()).isEqualTo(firstVersion + 1);
    assertThat(row(first).get("configValue").asText()).isEqualTo("10");
    assertThat(row(second).get("configValue").asText()).isEqualTo("20");
    assertThat(cacheManager.getCache("config").get(prefix + "a")).isNull();
    await()
        .atMost(Duration.ofSeconds(10))
        .until(
            () ->
                jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM sys_oper_log WHERE title = '参数设置' AND method LIKE '%saveValues' AND oper_param LIKE ?",
                        Long.class, "%" + first + "%")
                    > 0);
  }

  @Test
  void anyStaleVersionRejectsTheWholeBatchWithoutPartialWrites() {
    long first = create("stale-a", "1");
    long second = create("stale-b", "2");
    int firstVersion = row(first).get("version").asInt();
    int secondVersion = row(second).get("version").asInt();
    // 另一会话先修改第二项。
    putForData(
        "/system/configs/values",
        Map.of(
            "items",
            List.of(
                Map.of("id", second, "expectedVersion", secondVersion, "configValue", "other"))),
        token);

    JsonNode rejected =
        exchangeRaw(
            "/system/configs/values",
            HttpMethod.PUT,
            Map.of(
                "items",
                List.of(
                    Map.of("id", first, "expectedVersion", firstVersion, "configValue", "mine"),
                    Map.of("id", second, "expectedVersion", secondVersion, "configValue", "mine"))),
            token);

    assertThat(rejected.get("code").asInt()).isEqualTo(40900);
    assertThat(rejected.get("message").asText()).contains(prefix + "stale-b");
    assertThat(row(first).get("configValue").asText()).as("no partial write").isEqualTo("1");
    assertThat(row(second).get("configValue").asText()).isEqualTo("other");
  }

  @Test
  void duplicateItemsAndMissingRowsAreRejected() {
    long first = create("dup", "1");
    int version = row(first).get("version").asInt();
    JsonNode duplicate =
        exchangeRaw(
            "/system/configs/values",
            HttpMethod.PUT,
            Map.of(
                "items",
                List.of(
                    Map.of("id", first, "expectedVersion", version, "configValue", "x"),
                    Map.of("id", first, "expectedVersion", version, "configValue", "y"))),
            token);
    assertThat(duplicate.get("code").asInt()).isEqualTo(40000);
    JsonNode empty =
        exchangeRaw("/system/configs/values", HttpMethod.PUT, Map.of("items", List.of()), token);
    assertThat(empty.get("code").asInt()).isEqualTo(40000);
    JsonNode missing =
        exchangeRaw(
            "/system/configs/values",
            HttpMethod.PUT,
            Map.of(
                "items",
                List.of(
                    Map.of("id", first, "expectedVersion", version, "configValue", "x"),
                    Map.of("id", 9_191_919_191L, "expectedVersion", 0, "configValue", "y"))),
            token);
    assertThat(missing.get("code").asInt()).isEqualTo(40400);
    assertThat(row(first).get("configValue").asText()).isEqualTo("1");
  }

  @Test
  void singleUpdateHonoursOptionalExpectedVersion() {
    long id = create("single", "1");
    int version = row(id).get("version").asInt();
    putForData(
        "/system/configs/" + id,
        Map.of(
            "configKey",
            prefix + "single",
            "configName",
            "单项",
            "configValue",
            "2",
            "expectedVersion",
            version),
        token);
    JsonNode stale =
        exchangeRaw(
            "/system/configs/" + id,
            HttpMethod.PUT,
            Map.of(
                "configKey",
                prefix + "single",
                "configName",
                "单项",
                "configValue",
                "3",
                "expectedVersion",
                version),
            token);
    assertThat(stale.get("code").asInt()).isEqualTo(40900);
    // 旧客户端不带版本时保持原有行为。
    putForData(
        "/system/configs/" + id,
        Map.of("configKey", prefix + "single", "configName", "单项", "configValue", "4"),
        token);
    assertThat(row(id).get("configValue").asText()).isEqualTo("4");
  }

  private long create(String suffix, String value) {
    return postForData(
            "/system/configs",
            Map.of(
                "configKey", prefix + suffix, "configName", "批量测试 " + suffix, "configValue", value),
            token)
        .asLong();
  }

  private JsonNode row(long id) {
    JsonNode page =
        getForData("/system/configs/page?size=200&keyword=" + prefix, token).get("list");
    for (JsonNode item : page) {
      if (item.get("id").asLong() == id) {
        return item;
      }
    }
    throw new AssertionError("config row not found: " + id);
  }
}
