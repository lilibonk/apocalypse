package io.apocalypse.system.file.dto.response;

/**
 * 通用文件上传响应回执。
 *
 * @param key 存储安全键（如 {@code general/ef1234..._avatar.png}）
 * @param originalFilename 净化后的原始文件名
 * @param contentType 校验通过的 MIME 类型
 * @param size 文件字节大小
 */
public record UploadedFileResp(
    String key, String originalFilename, String contentType, long size) {}
