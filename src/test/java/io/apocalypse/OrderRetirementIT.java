package io.apocalypse;

import io.apocalypse.common.event.OrderCreatedEvent;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpMethod;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/** 退役业务端点，但保留历史事件载荷和提交后消费的兼容性；仅操作 Testcontainers 数据。 */
class OrderRetirementIT extends AbstractIntegrationTest {

  @Autowired private ApplicationEventPublisher publisher;

  @Autowired private PlatformTransactionManager transactionManager;

  @Test
  void retiredEndpointsStayUnavailableEvenWithSeededAdminPermissions() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(getForData("/system/users/me", token).get("perms").toString())
        .contains("order:create");
    for (String path : List.of("/orders/1", "/orders/page?page=1&size=20")) {
      assertThat(exchangeRaw(path, HttpMethod.GET, null, token).get("code").asInt())
          .isEqualTo(40400);
    }
    assertThat(
            exchangeRaw("/orders", HttpMethod.POST, Map.of("amount", "1.00"), token)
                .get("code")
                .asInt())
        .isEqualTo(40400);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT to_regclass('order_info') IS NOT NULL", Boolean.class))
        .isTrue();
  }

  @Test
  void historicalEventIsRecordedAndConsumedOnlyAfterCommit() {
    UUID id = UUID.randomUUID();
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);
    transaction.executeWithoutResult(
        status -> {
          publisher.publishEvent(event(id));
          assertThat(publicationCount(id, true)).isZero();
          assertThat(publicationCount(id, false)).isEqualTo(1);
        });
    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(() -> assertThat(publicationCount(id, true)).isEqualTo(1));
  }

  @Test
  void rolledBackEventDoesNotLeavePublication() {
    UUID id = UUID.randomUUID();
    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> {
              publisher.publishEvent(event(id));
              status.setRollbackOnly();
            });
    assertThat(publicationCount(id, false)).isZero();
  }

  private OrderCreatedEvent event(UUID id) {
    return new OrderCreatedEvent(
        id, LocalDateTime.now(), 1L, "retired-demo-test", 1L, BigDecimal.ONE);
  }

  private int publicationCount(UUID id, boolean completed) {
    String sql =
        "SELECT count(*) FROM event_publication WHERE serialized_event LIKE ?"
            + (completed ? " AND completion_date IS NOT NULL" : "");
    return jdbcTemplate.queryForObject(sql, Integer.class, "%" + id + "%");
  }
}
