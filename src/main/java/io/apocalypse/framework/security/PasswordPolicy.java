package io.apocalypse.framework.security;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.util.Locale;
import java.util.Set;

import org.springframework.util.StringUtils;

/** 强密码策略（登录安全四件套之一）：用于新建、重置和首次 bootstrap 密码；登录只做密码匹配。 */
public final class PasswordPolicy {

  /** 常见弱口令小表（ lowercase 比对）。 */
  private static final Set<String> WEAK_PASSWORDS =
      Set.of(
          "123456",
          "111111",
          "123123",
          "000000",
          "12345678",
          "123456789",
          "admin123",
          "password",
          "qwerty",
          "abc123");

  private PasswordPolicy() {}

  /** 校验密码强度，不满足时抛 {@link BizException}(40000)。 */
  public static void validate(String rawPassword) {
    if (!StringUtils.hasText(rawPassword) || rawPassword.length() < 8) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "密码长度至少 8 位");
    }
    boolean hasLetter = rawPassword.chars().anyMatch(Character::isLetter);
    boolean hasDigit = rawPassword.chars().anyMatch(Character::isDigit);
    if (!hasLetter || !hasDigit) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "密码需同时包含字母和数字");
    }
    if (WEAK_PASSWORDS.contains(rawPassword.toLowerCase(Locale.ROOT))) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "密码为常见弱口令，请更换");
    }
  }
}
