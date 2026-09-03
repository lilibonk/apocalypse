package io.apocalypse.calendar.domain;

/** 导入配额计费规则：文件字节外为每条审计记录预留 1 MiB，防止小文件绕过累计上限。 */
public final class DataImportStoragePolicy {

  public static final long RECORD_OVERHEAD_BYTES = 1024L * 1024;

  private DataImportStoragePolicy() {}

  public static long charge(long fileBytes) {
    if (fileBytes < 1) {
      throw new IllegalArgumentException("fileBytes must be positive");
    }
    return Math.addExact(fileBytes, RECORD_OVERHEAD_BYTES);
  }
}
