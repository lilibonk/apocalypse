package io.apocalypse.framework.storage;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 本地磁盘 {@link FileStoragePort} 默认实现。
 *
 * <ul>
 *   <li>严格校验 {@code category} 与 {@code storageKey}，经 {@link Path#normalize()} 后强制断言留在根目录内，防路径穿越；
 *   <li>强制校验文件非空、不超过 {@link StorageProperties#getMaxFileSizeBytes()} 以及 MIME 白名单；
 *   <li>生成带 SHA-256 前缀与 UUID 的不可预测存储文件名，避免同名覆盖与直猜遍历。
 * </ul>
 */
@Component
@EnableConfigurationProperties(StorageProperties.class)
public class LocalFileStorageAdapter implements FileStoragePort {

  private static final Pattern CATEGORY_PATTERN = Pattern.compile("^[a-z0-9_-]{1,32}$");

  private static final Pattern SAFE_FILENAME_CHARS = Pattern.compile("[^a-zA-Z0-9._-]");

  private final StorageProperties properties;

  private final ObjectProvider<Clock> clockProvider;

  public LocalFileStorageAdapter(
      StorageProperties properties, ObjectProvider<Clock> clockProvider) {
    this.properties = properties;
    this.clockProvider = clockProvider;
  }

  @Override
  public StoredFile store(
      String category, String originalFilename, String contentType, byte[] content) {
    if (category == null || !CATEGORY_PATTERN.matcher(category).matches()) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "非法的文件存储分类");
    }
    if (content == null || content.length == 0) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "上传文件内容不能为空");
    }
    if (content.length > properties.getMaxFileSizeBytes()) {
      throw new BizException(
          ErrorCode.PARAM_INVALID.getCode(),
          "上传文件大小超过上限（最大 " + properties.getMaxFileSizeBytes() + " 字节）");
    }
    String normalizedMime = normalizeContentType(contentType);
    if (!properties.getAllowedContentTypes().contains(normalizedMime)) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "不支持的文件类型: " + normalizedMime);
    }

    String safeName = sanitizeFilename(originalFilename);
    String sha256 = sha256Hex(content);
    String storageKey =
        category + "/" + sha256.substring(0, 12) + "_" + UUID.randomUUID() + "_" + safeName;
    Path target = resolveUnderRoot(storageKey);
    try {
      Files.createDirectories(target.getParent());
      Files.write(target, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
    } catch (IOException ex) {
      throw new IllegalStateException("写入存储文件失败: " + storageKey, ex);
    }
    Instant now = clockProvider.getIfAvailable(Clock::systemUTC).instant();
    return new StoredFile(storageKey, safeName, normalizedMime, content.length, sha256, now);
  }

  @Override
  public byte[] read(String storageKey) {
    Path target = resolveUnderRoot(storageKey);
    if (!Files.isRegularFile(target)) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "文件不存在或已删除");
    }
    try {
      return Files.readAllBytes(target);
    } catch (IOException ex) {
      throw new IllegalStateException("读取存储文件失败: " + storageKey, ex);
    }
  }

  @Override
  public void delete(String storageKey) {
    Path target = resolveUnderRoot(storageKey);
    try {
      Files.deleteIfExists(target);
    } catch (IOException ex) {
      throw new IllegalStateException("删除存储文件失败: " + storageKey, ex);
    }
  }

  private Path resolveUnderRoot(String storageKey) {
    if (storageKey == null || storageKey.isBlank() || storageKey.contains("\0")) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "非法的文件存储键");
    }
    Path root = properties.getLocalRoot().toAbsolutePath().normalize();
    Path resolved = root.resolve(storageKey).normalize();
    if (!resolved.startsWith(root) || resolved.equals(root)) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "检测到非法路径穿越访问");
    }
    return resolved;
  }

  private static String normalizeContentType(String contentType) {
    if (contentType == null || contentType.isBlank()) {
      return "application/octet-stream";
    }
    int semicolon = contentType.indexOf(';');
    String raw = semicolon >= 0 ? contentType.substring(0, semicolon) : contentType;
    return raw.trim().toLowerCase(Locale.ROOT);
  }

  private static String sanitizeFilename(String originalFilename) {
    if (originalFilename == null || originalFilename.isBlank()) {
      return "file.bin";
    }
    String baseName = Path.of(originalFilename).getFileName().toString();
    String cleaned = SAFE_FILENAME_CHARS.matcher(baseName).replaceAll("_");
    while (cleaned.startsWith(".")) {
      cleaned = cleaned.substring(1);
    }
    if (cleaned.isBlank()) {
      return "file.bin";
    }
    return cleaned.length() > 64 ? cleaned.substring(cleaned.length() - 64) : cleaned;
  }

  private static String sha256Hex(byte[] bytes) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(bytes));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 不可用", ex);
    }
  }
}
