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

  /** 允许上传的 MIME 类型白名单。 */
  private Set<String> allowedContentTypes =
      Set.of(
          "text/csv",
          "text/plain",
          "application/json",
          "application/pdf",
          "application/octet-stream",
          "image/png",
          "image/jpeg",
          "image/webp");
}
