package io.apocalypse;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 集成测试基类：Testcontainers 提供 PostgreSQL 18.6 与 Redis 8.10.1（{@code @ServiceConnection} 自动接管连接配置，不依赖本地
 * docker-compose）。提供 admin 登录取 token 与 R 结构断言工具方法。
 *
 * <p>容器采用单例模式（静态块启动、JVM 退出时由 Ryuk 回收）：不能用 {@code @Testcontainers + @Container} 生命周期——它会在每个测试类结束后停掉
 * static 容器，而 Spring 上下文跨测试类缓存复用，会导致连接池持有已关闭的连接。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
public abstract class AbstractIntegrationTest {

  protected static final String ADMIN_PASSWORD = "TestBootstrap2026";

  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18.6-alpine");

  @ServiceConnection(name = "redis")
  static final GenericContainer<?> REDIS =
      new GenericContainer<>(DockerImageName.parse("redis:8.10.1-alpine")).withExposedPorts(6379);

  static {
    POSTGRES.start();
    REDIS.start();
  }

  @Autowired protected TestRestTemplate restTemplate;

  @Autowired protected JdbcTemplate jdbcTemplate;

  @Autowired protected ObjectMapper objectMapper;

  /** 登录取 token（测试 profile 通过一次性 bootstrap 密码启用 admin）。 */
  protected String loginAndGetToken(String username, String password) {
    JsonNode body =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", username, "password", password),
            null);
    assertThat(body.get("code").asInt()).as("登录应成功: %s", body).isEqualTo(0);
    return body.at("/data/accessToken").asText();
  }

  protected JsonNode getForData(String path, String token) {
    return exchangeForData(path, HttpMethod.GET, null, token);
  }

  protected JsonNode postForData(String path, Object requestBody, String token) {
    return exchangeForData(path, HttpMethod.POST, requestBody, token);
  }

  protected JsonNode putForData(String path, Object requestBody, String token) {
    return exchangeForData(path, HttpMethod.PUT, requestBody, token);
  }

  protected JsonNode deleteForData(String path, String token) {
    return exchangeForData(path, HttpMethod.DELETE, null, token);
  }

  /** 发起请求并断言业务码为 0，返回 R 的 data 节点。 */
  protected JsonNode exchangeForData(
      String path, HttpMethod method, Object requestBody, String token) {
    JsonNode body = exchangeRaw(path, method, requestBody, token);
    assertThat(body.get("code").asInt()).as("业务码应为 0: %s", body).isEqualTo(0);
    return body.get("data");
  }

  /** 发起请求并断言 HTTP 200，返回完整 R 节点（调用方自行断言业务码）。 */
  protected JsonNode exchangeRaw(String path, HttpMethod method, Object requestBody, String token) {
    HttpHeaders headers = new HttpHeaders();
    if (token != null) {
      headers.setBearerAuth(token);
    }
    ResponseEntity<String> response =
        restTemplate.exchange(path, method, new HttpEntity<>(requestBody, headers), String.class);
    assertThat(response.getStatusCode().value()).as("HTTP 状态应为 200").isEqualTo(200);
    return objectMapper.readTree(response.getBody());
  }
}
