package io.apocalypse;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** JWT claim、client token 传输与 Actuator 管理面授权回归。 */
class SecurityHardeningIT extends AbstractIntegrationTest {

  @Autowired private JwtEncoder jwtEncoder;

  @Test
  void signedAccessTokenMissingUidIsRejected() {
    String token =
        encode(
            JwtClaimsSet.builder()
                .issuer("apocalypse")
                .audience(List.of("apocalypse-api"))
                .subject("admin")
                .id(UUID.randomUUID().toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .claim("type", "access")
                .claim("authorities", List.of("system:user:list"))
                .claim("av", 0)
                .claim("uv", 0)
                .claim("cv", 0)
                .build());

    assertUnauthorized("/system/users/page?page=1&size=1", token);
  }

  @Test
  void wrongAudienceIsRejected() {
    String token =
        encode(
            JwtClaimsSet.builder()
                .issuer("apocalypse")
                .audience(List.of("another-api"))
                .subject("admin")
                .id(UUID.randomUUID().toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .claim("type", "client")
                .claim("scope", "management:read")
                .build());

    assertUnauthorized("/actuator/prometheus", token);
  }

  @Test
  void onlyDedicatedClientScopeCanReadPrometheus() {
    JsonNode issued =
        exchangeRaw(
            "/auth/token",
            HttpMethod.POST,
            Map.of(
                "clientId", "management-test-client",
                "clientSecret", "management-test-secret"),
            null);
    assertThat(issued.get("code").asInt()).isZero();
    String clientToken = issued.at("/data/accessToken").asText();

    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth(clientToken);
    ResponseEntity<String> prometheus =
        restTemplate.exchange(
            "/actuator/prometheus", HttpMethod.GET, new HttpEntity<>(null, headers), String.class);
    assertThat(prometheus.getStatusCode().value()).isEqualTo(200);
    assertThat(prometheus.getBody()).contains("# HELP");

    String userToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode denied = exchangeRaw("/actuator/prometheus", HttpMethod.GET, null, userToken);
    assertThat(denied.get("code").asInt()).isEqualTo(40300);
  }

  @Test
  void clientSecretQueryParametersAreNoLongerAccepted() {
    JsonNode body =
        exchangeRaw(
            "/auth/token?client_id=management-test-client&client_secret=management-test-secret",
            HttpMethod.POST,
            Map.of(),
            null);
    assertThat(body.get("code").asInt()).isNotZero();
  }

  private String encode(JwtClaimsSet claims) {
    JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
    return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
  }

  private void assertUnauthorized(String path, String token) {
    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth(token);
    ResponseEntity<String> response =
        restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(null, headers), String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(401);
  }
}
