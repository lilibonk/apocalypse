package io.apocalypse.framework.storage;

import java.nio.file.Path;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/** 文件存储配置属性（{@code apocalypse.storage.*}）。 */
@Getter
@Setter
@ConfigurationProperties(prefix = "apocalypse.storage")
public class StorageProperties {

  /** 本地存储根目录（默认使用系统临时目录下的 {@code apocalypse-storage}）。 */
  private Path localRoot = Path.of(System.getProperty("java.io.tmpdir"), "apocalypse-storage");

  /** 单文件最大字节数（默认 10 MiB）。 */
  private long maxFileSizeBytes = 10L * 1024 * 1024;

  /** 全局活跃文件累计配额上限（默认 512 MiB）。 */
  private long totalQuotaBytes = 512L * 1024 * 1024;

  /** 单用户活跃文件累计配额上限（默认 64 MiB）。 */
  private long userQuotaBytes = 64L * 1024 * 1024;

  /** 允许上传的 MIME 类型白名单（禁止开放无约束的 application/octet-stream）。 */
  private Set<String> allowedContentTypes =
      Set.of(
          "text/csv",
          "text/plain",
          "application/json",
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp");
}
