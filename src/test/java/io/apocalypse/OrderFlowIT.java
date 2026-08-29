package io.apocalypse;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/** 下单链路集成测试：跨模块 facade 校验买家、订单可查、事件登记（event_publication）。 */
class OrderFlowIT extends AbstractIntegrationTest {

  @Test
  void createOrderThenEventPublished() {
    String token = loginAndGetToken("admin", "admin123");

    // 以种子 admin（id=1）下单
    JsonNode created =
        postForData("/orders", Map.of("userId", 1, "amount", "99.50", "remark", "集成测试下单"), token);
    assertThat(created.get("id").isTextual()).isTrue();
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
  void createOrderWithUnknownUserReturns40400() {
    String token = loginAndGetToken("admin", "admin123");

    JsonNode body =
        exchangeRaw(
            "/orders", HttpMethod.POST, Map.of("userId", 999999999, "amount", "1.00"), token);

    assertThat(body.get("code").asInt()).isEqualTo(40400);
  }
}
