package io.apocalypse.framework.storage;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 确定性文件内容与扩展名一致性核验（零新增依赖）：
 *
 * <ul>
 *   <li>二进制图像/PDF 检查真实文件头魔数，拒绝伪造声明 MIME；
 *   <li>文本/CSV/JSON 强制严格 UTF-8 解码，拦截控制字节与 HTML/SVG/Script 活跃标记伪装；
 *   <li>当原始文件名包含扩展名时，校验扩展名与已认证 MIME 一致。
 * </ul>
 */
final class FileContentVerifier {

  private static final byte[] PNG_MAGIC = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

  private static final byte[] JPEG_MAGIC = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};

  private static final byte[] PDF_MAGIC = {0x25, 0x50, 0x44, 0x46, 0x2D}; // %PDF-

  private static final byte[] RIFF_MAGIC = {'R', 'I', 'F', 'F'};

  private static final byte[] WEBP_MAGIC = {'W', 'E', 'B', 'P'};

  private static final Set<String> PLAIN_TEXT_EXTENSIONS = Set.of("txt", "log", "md", "text");

  private static final ObjectMapper JSON_MAPPER =
      JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

  private FileContentVerifier() {}

  static void verify(String contentType, String filename, byte[] content) {
    String ext = extensionOf(filename);
    switch (contentType) {
      case "image/png" -> {
        requireExtension(ext, Set.of("png"), contentType);
        requirePrefix(content, PNG_MAGIC, 0, "PNG 文件签名校验失败");
      }
      case "image/jpeg" -> {
        requireExtension(ext, Set.of("jpg", "jpeg"), contentType);
        requirePrefix(content, JPEG_MAGIC, 0, "JPEG 文件签名校验失败");
      }
      case "image/webp" -> {
        requireExtension(ext, Set.of("webp"), contentType);
        if (content.length < 12) {
          throw invalid("WEBP 文件签名校验失败");
        }
        requirePrefix(content, RIFF_MAGIC, 0, "WEBP 文件签名校验失败");
        requirePrefix(content, WEBP_MAGIC, 8, "WEBP 文件签名校验失败");
      }
      case "application/pdf" -> {
        requireExtension(ext, Set.of("pdf"), contentType);
        requirePrefix(content, PDF_MAGIC, 0, "PDF 文件签名校验失败");
      }
      case "text/plain" -> {
        requireExtension(ext, PLAIN_TEXT_EXTENSIONS, contentType);
        verifySafeUtf8Text(content);
      }
      case "text/csv" -> {
        requireExtension(ext, Set.of("csv"), contentType);
        verifySafeUtf8Text(content);
      }
      case "application/json" -> {
        requireExtension(ext, Set.of("json"), contentType);
        String text = verifySafeUtf8Text(content);
        verifyJson(text);
      }
      default -> {
        // 自定义允许扩展 MIME 若非内置 7 类，仍确保至少通过白名单检查。
      }
    }
  }

  private static String verifySafeUtf8Text(byte[] content) {
    String decoded;
    try {
      decoded =
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(content))
              .toString();
    } catch (CharacterCodingException ex) {
      throw invalid("文本文件必须使用有效 UTF-8 编码");
    }
    if (!decoded.isEmpty() && decoded.charAt(0) == '\uFEFF') {
      decoded = decoded.substring(1);
    }
    for (int i = 0; i < decoded.length(); i++) {
      char ch = decoded.charAt(i);
      if ((ch < 0x20 && ch != '\t' && ch != '\n' && ch != '\r') || ch == 0x7F) {
        throw invalid("文本文件包含非法二进制控制字符");
      }
    }
    String normalizedHead = decoded.stripLeading().toLowerCase(Locale.ROOT);
    if (normalizedHead.startsWith("<!doctype html")
        || normalizedHead.startsWith("<html")
        || normalizedHead.startsWith("<script")
        || normalizedHead.startsWith("<svg")) {
      throw invalid("文本文件禁止包含 HTML/SVG/Script 活跃标记");
    }
    return decoded;
  }

  private static void verifyJson(String text) {
    String trimmed = text.trim();
    boolean container =
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
            || (trimmed.startsWith("[") && trimmed.endsWith("]"));
    if (!container) {
      throw invalid("JSON 文件内容必须是有效的对象或数组");
    }
    try {
      JSON_MAPPER.readTree(trimmed);
    } catch (JacksonException ex) {
      throw invalid("JSON 文件语法无效");
    }
  }

  private static void requirePrefix(byte[] content, byte[] expected, int offset, String message) {
    if (content.length < offset + expected.length) {
      throw invalid(message);
    }
    for (int i = 0; i < expected.length; i++) {
      if (content[offset + i] != expected[i]) {
        throw invalid(message);
      }
    }
  }

  private static void requireExtension(
      String ext, Set<String> allowedExtensions, String contentType) {
    if (!ext.isEmpty() && !allowedExtensions.contains(ext)) {
      throw invalid("文件扩展名 ." + ext + " 与声明类型 " + contentType + " 不匹配");
    }
  }

  private static String extensionOf(String filename) {
    if (filename == null || filename.isBlank()) {
      return "";
    }
    int dot = filename.lastIndexOf('.');
    if (dot < 0 || dot == filename.length() - 1) {
      return "";
    }
    return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  private static BizException invalid(String message) {
    return new BizException(ErrorCode.PARAM_INVALID.getCode(), message);
  }
}
