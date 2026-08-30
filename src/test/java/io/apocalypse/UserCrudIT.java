package io.apocalypse;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.system.user.entity.SysUserEntity;
import io.apocalypse.system.user.mapper.SysUserMapper;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import tools.jackson.databind.JsonNode;

/** 用户 CRUD + 两级缓存生命周期集成测试。 */
class UserCrudIT extends AbstractIntegrationTest {

  @Autowired private CacheManager cacheManager;

  @Autowired private SysUserMapper sysUserMapper;

  @Test
  void userCrudAndCacheLifecycle() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    // 创建：响应中装箱 Long 主键应序列化为 String（JacksonConfig 生效验证）
    JsonNode created =
        postForData(
            "/system/users",
            Map.of("username", "ituser", "password", "ituser123", "nickname", "集成测试用户"),
            token);
    assertThat(created.get("id").isTextual()).as("id 应为 String 类型").isTrue();
    long userId = Long.parseLong(created.get("id").asText());

    // 详情：触发 user 缓存写入
    JsonNode detail = getForData("/system/users/" + userId, token);
    assertThat(detail.get("username").asText()).isEqualTo("ituser");
    assertThat(detail.get("id").isTextual()).isTrue();
    Cache userCache = cacheManager.getCache("user");
    assertThat(userCache).isNotNull();
    assertThat(userCache.get(userId)).as("get 后 user 缓存应包含该 key").isNotNull();

    // 更新：缓存应被 evict
    JsonNode updated = putForData("/system/users/" + userId, Map.of("nickname", "集成测试用户2"), token);
    assertThat(updated.get("nickname").asText()).isEqualTo("集成测试用户2");
    assertThat(userCache.get(userId)).as("update 后缓存应被 evict").isNull();

    // 分页：按关键字能查到
    JsonNode page = getForData("/system/users/page?page=1&size=10&keyword=ituser", token);
    assertThat(page.get("total").asLong()).isGreaterThanOrEqualTo(1);
    assertThat(page.at("/list/0/username").asText()).isEqualTo("ituser");

    // 逻辑删除：删除后再查应报 40400
    deleteForData("/system/users/" + userId, token);
    JsonNode afterDelete = exchangeRaw("/system/users/" + userId, HttpMethod.GET, null, token);
    assertThat(afterDelete.get("code").asInt()).isEqualTo(40400);
  }

  @Test
  void sameUsernameCanBeDeletedAndRecreatedRepeatedly() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String username = "repeat_delete_user";

    for (int round = 0; round < 3; round++) {
      JsonNode created =
          postForData(
              "/system/users",
              Map.of("username", username, "password", "Repeat12345", "nickname", "重复重建"),
              token);
      deleteForData("/system/users/" + created.get("id").asText(), token);
    }

    Integer tombstones =
        jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM sys_user WHERE username = ? AND deleted = 1",
            Integer.class,
            username);
    assertThat(tombstones).isEqualTo(3);
  }

  @Test
  void pageSizeAboveGlobalLimitReturnsParameterError() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode body = exchangeRaw("/system/users/page?page=1&size=201", HttpMethod.GET, null, token);

    assertThat(body.get("code").asInt()).isEqualTo(40000);
  }

  @Test
  void staleOptimisticLockUpdateReturnsConflictInsteadOfFalseSuccess() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "optimistic_lock_user",
                "password", "Optimistic12345",
                "nickname", "乐观锁测试"),
            token);
    long userId = created.get("id").asLong();

    SysUserEntity winner = sysUserMapper.selectById(userId);
    SysUserEntity stale = sysUserMapper.selectById(userId);
    winner.setNickname("先提交的更新");
    stale.setNickname("过期的更新");

    assertThat(sysUserMapper.updateById(winner)).isEqualTo(1);
    int staleAffectedRows = sysUserMapper.updateById(stale);
    assertThat(staleAffectedRows).isZero();
    assertThatThrownBy(() -> ConcurrencyGuard.requireSingleRow(staleAffectedRows))
        .isInstanceOfSatisfying(
            BizException.class, exception -> assertThat(exception.getCode()).isEqualTo(40900));

    deleteForData("/system/users/" + userId, token);
  }
}
