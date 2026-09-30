package io.apocalypse.framework.security;

import io.apocalypse.common.exception.BizException;

import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompatiblePasswordEncoderTest {

  private final PasswordEncoder encoder = CompatiblePasswordEncoder.create();

  @Test
  void newPasswordsDeclareTheAlgorithmAndRejectAnIncorrectPassword() {
    String encoded = encoder.encode("NewCredential8");
    assertThat(encoded).startsWith("{bcrypt}$2a$10$");
    assertThat(encoder.matches("NewCredential8", encoded)).isTrue();
    assertThat(encoder.matches("NewCredential9", encoded)).isFalse();
    assertThat(encoder.upgradeEncoding(encoded)).isFalse();
  }

  static Stream<BCryptPasswordEncoder.BCryptVersion> legacyVersions() {
    return Stream.of(BCryptPasswordEncoder.BCryptVersion.values());
  }

  @ParameterizedTest
  @MethodSource("legacyVersions")
  void legacyBcryptRemainsValidWithoutChangingUnicode(BCryptPasswordEncoder.BCryptVersion version) {
    String raw = "e\u0301Password9";
    String legacy = new BCryptPasswordEncoder(version).encode(raw);
    assertThat(encoder.matches(raw, legacy)).isTrue();
    assertThat(encoder.matches("éPassword9", legacy)).isFalse();
    assertThat(encoder.upgradeEncoding(legacy)).isTrue();
  }

  @Test
  void compatibilityDoesNotEnablePlaintextOrAnUnknownAlgorithm() {
    String legacy = new BCryptPasswordEncoder().encode("ValidCredential8");
    for (String stored :
        new String[] {
          "ValidCredential8", "{noop}ValidCredential8", "{unknown}" + legacy, "{bcrypt}invalid"
        }) {
      assertThat(encoder.matches("ValidCredential8", stored)).isFalse();
    }
    assertThat(encoder.matches("ValidCredential8", null)).isFalse();
    assertThat(encoder.matches(null, legacy)).isFalse();
  }

  @Test
  void newPasswordsUseUtf8ByteLimitsWithoutRejectingTheBoundary() {
    String boundary = "界".repeat(23) + "A1b";
    PasswordPolicy.validate(boundary);
    assertThat(encoder.matches(boundary, encoder.encode(boundary))).isTrue();
    assertThatThrownBy(() -> PasswordPolicy.validate(boundary + "c"))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("72 字节");
    PasswordPolicy.validate("A1" + "x".repeat(70));
    assertThatThrownBy(() -> PasswordPolicy.validate("A1" + "x".repeat(71)))
        .isInstanceOf(BizException.class);
  }
}
