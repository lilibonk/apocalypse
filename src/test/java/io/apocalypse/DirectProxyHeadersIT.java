package io.apocalypse;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.ratelimit.limits.login=2")
class DirectProxyHeadersIT extends AbstractIntegrationTest {

  @Autowired private RedissonClient redissonClient;

  @BeforeEach
  @AfterEach
  void clearLocalLimiter() {
    for (String ip : new String[] {"127.0.0.1", "::1", "0:0:0:0:0:0:0:1"}) {
      redissonClient.getRateLimiter("apoc:rl:login:" + ip).delete();
    }
  }

  @Test
  void defaultDirectRequestsUseSocketIpForRateLimitsAndAudit() {
    String agent = "direct-proxy-" + UUID.randomUUID();
    assertThat(login(agent, "203.0.113.10")).isZero();
    assertThat(login(agent, "203.0.113.11")).isZero();
    assertThat(login(agent, "203.0.113.12")).isEqualTo(42900);

    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(
            () ->
                assertThat(
                        jdbcTemplate.queryForList(
                            "SELECT ip FROM sys_login_log WHERE user_agent = ?",
                            String.class,
                            agent))
                    .hasSize(2)
                    .allSatisfy(ip -> assertThat(ip).isIn("127.0.0.1", "::1", "0:0:0:0:0:0:0:1")));
  }

  private int login(String agent, String claimedIp) {
    var headers = new HttpHeaders();
    headers.set("Forwarded", "for=" + claimedIp + ";proto=https");
    headers.set("X-Forwarded-For", claimedIp);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("User-Agent", agent);
    var response =
        restTemplate.exchange(
            "/auth/login",
            HttpMethod.POST,
            new HttpEntity<>(Map.of("username", "admin", "password", ADMIN_PASSWORD), headers),
            String.class);
    return objectMapper.readTree(response.getBody()).path("code").asInt();
  }
}
