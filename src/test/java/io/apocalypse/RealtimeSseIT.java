package io.apocalypse;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 实时 SSE 流端到端集成测试：非缓冲响应头、主题权限隔离与注销/全局权限变更实时断流。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RealtimeSseIT extends AbstractIntegrationTest {

  private static final String EOF_MARKER = "__SSE_EOF__";

  @LocalServerPort private int port;

  @Test
  void enforcesStreamHeadersTopicAuthorizationAndImmediateDisconnectOnRevocation()
      throws Exception {
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    long noPermUserId =
        Long.parseLong(
            postForData(
                    "/system/users",
                    Map.of(
                        "username",
                        "sse_noperm_" + UUID.randomUUID().toString().substring(0, 6),
                        "password",
                        "StrongSse@2026",
                        "nickname",
                        "SSE NoPerm",
                        "deptId",
                        11L,
                        "status",
                        1),
                    adminToken)
                .path("id")
                .asText());
    String noPermUsername =
        jdbcTemplate.queryForObject(
            "SELECT username FROM sys_user WHERE id = ?", String.class, noPermUserId);
    String noPermToken = loginAndGetToken(noPermUsername, "StrongSse@2026");

    HttpClient httpClient =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    try (ExecutorService readerPool = Executors.newVirtualThreadPerTaskExecutor();
        SseStreamHandle adminStream = openStream(httpClient, adminToken, readerPool);
        SseStreamHandle noPermStream = openStream(httpClient, noPermToken, readerPool)) {

      assertThat(adminStream.response.statusCode()).isEqualTo(200);
      assertThat(adminStream.response.headers().firstValue("X-Accel-Buffering")).contains("no");
      assertThat(adminStream.response.headers().firstValue("Cache-Control"))
          .hasValueSatisfying(val -> assertThat(val).contains("no-store"));

      assertThat(adminStream.awaitSubstring("\"topic\":\"connected\"", Duration.ofSeconds(5)))
          .isTrue();
      assertThat(noPermStream.awaitSubstring("\"topic\":\"connected\"", Duration.ofSeconds(5)))
          .isTrue();

      // 触发带 @OperLog 的写操作，广播 operationLogged：admin 收到，无权限用户不得收到
      String cfgKey = "sse.audit." + UUID.randomUUID().toString().substring(0, 8);
      postForData(
          "/system/configs",
          Map.of("configKey", cfgKey, "configName", "SSE Config", "configValue", "v1"),
          adminToken);

      assertThat(adminStream.awaitSubstring("\"topic\":\"operationLogged\"", Duration.ofSeconds(5)))
          .isTrue();
      assertThat(noPermStream.pollMatching("\"topic\":\"operationLogged\"", Duration.ofMillis(600)))
          .isFalse();

      // 1) 单会话主动注销后，该用户 SSE 流立即收到服务端完成/断流（EOF）
      JsonNode logoutResp = exchangeRaw("/auth/logout", HttpMethod.POST, null, noPermToken);
      assertThat(logoutResp.path("code").asInt()).isZero();
      assertThat(noPermStream.awaitEof(Duration.ofSeconds(5))).isTrue();

      // 2) 创建并更新/删除角色触发全局授权版本（av）递增后，admin 当前 SSE 流也应立即断流
      String suffix = UUID.randomUUID().toString().substring(0, 6);
      long roleId =
          Long.parseLong(
              postForData(
                      "/system/roles",
                      Map.of(
                          "roleName",
                          "sse-role-" + suffix,
                          "roleKey",
                          "sse_role_" + suffix,
                          "sort",
                          99,
                          "status",
                          1,
                          "dataScope",
                          "DEPT"),
                      adminToken)
                  .asText());
      assertThat(
              exchangeRaw("/system/roles/" + roleId, HttpMethod.DELETE, null, adminToken)
                  .path("code")
                  .asInt())
          .isZero();
      assertThat(adminStream.awaitEof(Duration.ofSeconds(5))).isTrue();
    }
  }

  private SseStreamHandle openStream(
      HttpClient client, String accessToken, ExecutorService readerPool) throws Exception {
    HttpRequest req =
        HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/system/realtime/stream"))
            .header("Accept", "text/event-stream")
            .header("Authorization", "Bearer " + accessToken)
            .GET()
            .build();
    HttpResponse<InputStream> response =
        client.send(req, HttpResponse.BodyHandlers.ofInputStream());
    BlockingQueue<String> lines = new LinkedBlockingQueue<>();
    readerPool.submit(
        () -> {
          try (BufferedReader reader =
              new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
              lines.offer(line);
            }
          } catch (Exception ignored) {
            // 连接关闭即结束读循环
          } finally {
            lines.offer(EOF_MARKER);
          }
        });
    return new SseStreamHandle(response, lines);
  }

  private static final class SseStreamHandle implements AutoCloseable {
    final HttpResponse<InputStream> response;
    final BlockingQueue<String> lines;

    SseStreamHandle(HttpResponse<InputStream> response, BlockingQueue<String> lines) {
      this.response = response;
      this.lines = lines;
    }

    boolean awaitSubstring(String needle, Duration timeout) throws InterruptedException {
      return pollMatching(needle, timeout);
    }

    boolean pollMatching(String needle, Duration timeout) throws InterruptedException {
      long deadline = System.nanoTime() + timeout.toNanos();
      while (System.nanoTime() < deadline) {
        long remainingMs =
            Math.max(1L, TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime()));
        String line = lines.poll(remainingMs, TimeUnit.MILLISECONDS);
        if (line == null) {
          return false;
        }
        if (EOF_MARKER.equals(line)) {
          return false;
        }
        if (line.contains(needle)) {
          return true;
        }
      }
      return false;
    }

    boolean awaitEof(Duration timeout) throws InterruptedException {
      long deadline = System.nanoTime() + timeout.toNanos();
      while (System.nanoTime() < deadline) {
        long remainingMs =
            Math.max(1L, TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime()));
        String line = lines.poll(remainingMs, TimeUnit.MILLISECONDS);
        if (EOF_MARKER.equals(line)) {
          return true;
        }
      }
      return false;
    }

    @Override
    public void close() throws Exception {
      response.body().close();
    }
  }
}
