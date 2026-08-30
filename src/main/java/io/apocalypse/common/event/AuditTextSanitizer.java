package io.apocalypse.common.event;

/** 审计事件文本边界：去除 PostgreSQL 不接受的 NUL，并按 Unicode code point 安全截断。 */
public final class AuditTextSanitizer {

  public static final int USERNAME_MAX_LENGTH = 64;

  public static final int IP_MAX_LENGTH = 64;

  public static final int USER_AGENT_MAX_LENGTH = 255;

  public static final int MESSAGE_MAX_LENGTH = 255;

  public static final int OPER_TITLE_MAX_LENGTH = 64;

  public static final int BUSINESS_TYPE_MAX_LENGTH = 32;

  public static final int METHOD_MAX_LENGTH = 128;

  public static final int OPER_NAME_MAX_LENGTH = 64;

  public static final int OPER_PAYLOAD_MAX_LENGTH = 1000;

  public static final int ERROR_MESSAGE_MAX_LENGTH = 512;

  private AuditTextSanitizer() {}

  public static String fit(String value, int maxCodePoints) {
    if (value == null) {
      return null;
    }
    String sanitized = value.replace('\u0000', '\uFFFD');
    int count = sanitized.codePointCount(0, sanitized.length());
    if (count <= maxCodePoints) {
      return sanitized;
    }
    return sanitized.substring(0, sanitized.offsetByCodePoints(0, maxCodePoints));
  }
}
