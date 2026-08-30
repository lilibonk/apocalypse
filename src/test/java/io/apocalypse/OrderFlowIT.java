package io.apocalypse;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/** 下单链路集成测试：跨模块 facade 校验买家、订单可查、事件登记（event_publication）。 */
class OrderFlowIT extends AbstractIntegrationTest {

  private static final long ORDER_ROLE_ID = 9000;

  private static final long USER_A_ID = 9001;

  private static final long USER_B_ID = 9002;

  @Autowired private CacheManager cacheManager;

  @BeforeEach
  void prepareOrderUsers() {
    jdbcTemplate.update("DELETE FROM order_info WHERE user_id IN (?, ?)", USER_A_ID, USER_B_ID);
    jdbcTemplate.update("DELETE FROM sys_user_role WHERE user_id IN (?, ?)", USER_A_ID, USER_B_ID);
    jdbcTemplate.update("DELETE FROM sys_role_menu WHERE role_id = ?", ORDER_ROLE_ID);
    jdbcTemplate.update("DELETE FROM sys_user WHERE id IN (?, ?)", USER_A_ID, USER_B_ID);
    jdbcTemplate.update("DELETE FROM sys_role WHERE id = ?", ORDER_ROLE_ID);
    jdbcTemplate.update(
        """
        INSERT INTO sys_role (id, role_name, role_key, sort, status, create_by, update_by)
        VALUES (?, '订单普通用户', 'order_user_it', 90, 1, 'test', 'test')
        """,
        ORDER_ROLE_ID);
    jdbcTemplate.update(
        """
        INSERT INTO sys_user
            (id, username, password, nickname, status, create_by, update_by)
        SELECT ?, ?, password, ?, 1, 'test', 'test' FROM sys_user WHERE id = 1
        """,
        USER_A_ID,
        "order_user_a",
        "订单用户 A");
    jdbcTemplate.update(
        """
        INSERT INTO sys_user
            (id, username, password, nickname, status, create_by, update_by)
        SELECT ?, ?, password, ?, 1, 'test', 'test' FROM sys_user WHERE id = 1
        """,
        USER_B_ID,
        "order_user_b",
        "订单用户 B");
    jdbcTemplate.batchUpdate(
        "INSERT INTO sys_role_menu (role_id, menu_id) VALUES (?, ?)",
        java.util.List.of(
            new Object[] {ORDER_ROLE_ID, 161L},
            new Object[] {ORDER_ROLE_ID, 162L},
            new Object[] {ORDER_ROLE_ID, 164L}));
    jdbcTemplate.update(
        "INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", USER_A_ID, ORDER_ROLE_ID);
    jdbcTemplate.update(
        "INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", USER_B_ID, ORDER_ROLE_ID);
    Cache permissionCache = cacheManager.getCache("userPerms");
    if (permissionCache != null) {
      permissionCache.evict(USER_A_ID);
      permissionCache.evict(USER_B_ID);
    }
  }

  @Test
  void createOrderThenEventPublished() {
    String token = loginAndGetToken("order_user_a", ADMIN_PASSWORD);

    // 即使请求夹带 userId，也必须以 JWT uid 作为买家。
    JsonNode created =
        postForData(
            "/orders", Map.of("userId", USER_B_ID, "amount", "99.50", "remark", "集成测试下单"), token);
    assertThat(created.get("id").isTextual()).isTrue();
    assertThat(created.get("userId").asLong()).isEqualTo(USER_A_ID);
    assertThat(created.get("status").asText()).isEqualTo("PENDING");
    assertThat(created.get("orderNo").asText()).startsWith("O");

    // 下单成功且可查
    JsonNode detail = getForData("/orders/" + created.get("id").asText(), token);
    assertThat(detail.get("orderNo").asText()).isEqualTo(created.get("orderNo").asText());

    // 事件链路：事务提交后 event_publication 表应出现 OrderCreatedEvent 登记记录
    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(
            () -> {
              Integer count =
                  jdbcTemplate.queryForObject(
                      "SELECT COUNT(*) FROM event_publication WHERE event_type LIKE '%OrderCreatedEvent%'",
                      Integer.class);
              assertThat(count).isNotNull().isGreaterThan(0);
            });
  }

  @Test
  void anotherUserCannotReadOrListOrder() {
    String userAToken = loginAndGetToken("order_user_a", ADMIN_PASSWORD);
    JsonNode created = postForData("/orders", Map.of("amount", "1.00"), userAToken);
    String orderId = created.get("id").asText();

    String userBToken = loginAndGetToken("order_user_b", ADMIN_PASSWORD);
    JsonNode detail = exchangeRaw("/orders/" + orderId, HttpMethod.GET, null, userBToken);
    assertThat(detail.get("code").asInt()).as("跨用户详情不得泄露资源存在性").isEqualTo(40400);

    JsonNode page = getForData("/orders/page?page=1&size=20", userBToken);
    assertThat(page.get("list")).isEmpty();

    // admin 具备 order:read:any，可读取该订单。
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(getForData("/orders/" + orderId, adminToken).get("id").asText()).isEqualTo(orderId);
  }

  @Test
  void userWithoutOrderPermissionGets40300() {
    jdbcTemplate.update("DELETE FROM sys_user_role WHERE user_id = ?", USER_A_ID);
    String token = loginAndGetToken("order_user_a", ADMIN_PASSWORD);

    JsonNode body = exchangeRaw("/orders", HttpMethod.POST, Map.of("amount", "1.00"), token);

    assertThat(body.get("code").asInt()).isEqualTo(40300);
  }
}
