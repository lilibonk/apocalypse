package io.apocalypse.framework.storage;

/** 统一文件存储端口（Port）：屏蔽本地磁盘与对象存储（S3/OSS/MinIO）差异，内置路径穿越、MIME 白名单与大小配额防护。 */
public interface FileStoragePort {

  /**
   * 存储文件并返回安全存储回执。
   *
   * @param category 业务分类目录（仅允许 {@code [a-z0-9_-]+}）
   * @param originalFilename 原始文件名
   * @param contentType MIME 类型
   * @param content 文件字节内容
   * @return 存储元数据
   */
  StoredFile store(String category, String originalFilename, String contentType, byte[] content);

  /**
   * 按安全存储键读取文件字节。
   *
   * @param storageKey {@link StoredFile#storageKey()}
   * @return 文件字节数组
   */
  byte[] read(String storageKey);

  /**
   * 按安全存储键删除文件（幂等）。
   *
   * @param storageKey {@link StoredFile#storageKey()}
   */
  void delete(String storageKey);
}
