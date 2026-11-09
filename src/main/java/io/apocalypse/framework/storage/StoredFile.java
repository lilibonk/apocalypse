package io.apocalypse.framework.storage;

import java.time.Instant;

/**
 * 已持久化文件的元数据回执。
 *
 * @param storageKey 相对存储根路径的安全键（如 {@code avatar/20261109/ef12..._avatar.png}）
 * @param originalFilename 净化后的原始文件名
 * @param contentType 校验通过的 MIME 类型
 * @param sizeBytes 文件字节大小
 * @param sha256Hex 内容 SHA-256 十六进制摘要
 * @param storedAt 存储时间戳（UTC）
 */
public record StoredFile(
    String storageKey,
    String originalFilename,
    String contentType,
    long sizeBytes,
    String sha256Hex,
    Instant storedAt) {}
