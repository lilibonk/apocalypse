package io.apocalypse.framework.security;

import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 新密码带算法标记；仅为已存储的无前缀 bcrypt 保留兼容验证。 */
final class CompatiblePasswordEncoder {

  private static final Pattern LEGACY_BCRYPT =
      Pattern.compile("\\A\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}\\z");

  private CompatiblePasswordEncoder() {}

  static PasswordEncoder create() {
    BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();
    DelegatingPasswordEncoder encoder =
        new DelegatingPasswordEncoder("bcrypt", Map.of("bcrypt", bcrypt));
    encoder.setDefaultPasswordEncoderForMatches(
        new PasswordEncoder() {
          @Override
          public String encode(CharSequence rawPassword) {
            throw new UnsupportedOperationException("兼容验证器不签发新密码");
          }

          @Override
          public boolean matches(CharSequence rawPassword, String encodedPassword) {
            return rawPassword != null
                && encodedPassword != null
                && LEGACY_BCRYPT.matcher(encodedPassword).matches()
                && bcrypt.matches(rawPassword, encodedPassword);
          }
        });
    return encoder;
  }
}
