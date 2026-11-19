package io.apocalypse.framework.storage;

import io.apocalypse.common.exception.BizException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link LocalFileStorageAdapter} 单元测试（路径穿越防御、真实魔数与内容签名校验、MIME 白名单与大小上限）。 */
class LocalFileStorageAdapterTest {

  private static final byte[] PNG_BYTES =
      new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01};

  private static final byte[] JPEG_BYTES =
      new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10};

  private static final byte[] WEBP_BYTES =
      new byte[] {'R', 'I', 'F', 'F', 0x24, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P', 'V', 'P', '8'};

  private static final byte[] PDF_BYTES = "%PDF-1.7\n%...".getBytes(StandardCharsets.US_ASCII);

  @TempDir Path tempDir;

  private LocalFileStorageAdapter createAdapter(long maxBytes) {
    StorageProperties props = new StorageProperties();
    props.setLocalRoot(tempDir);
    props.setMaxFileSizeBytes(maxBytes);
    StaticListableBeanFactory beanFactory = new StaticListableBeanFactory();
    beanFactory.addBean("clock", Clock.systemUTC());
    return new LocalFileStorageAdapter(props, beanFactory.getBeanProvider(Clock.class));
  }

  @Test
  void storesReadsAndDeletesValidFilesSafely() {
    LocalFileStorageAdapter adapter = createAdapter(1024);
    byte[] csvPayload = "id,username\n1,admin\n".getBytes(StandardCharsets.UTF_8);

    StoredFile storedCsv =
        adapter.store("exports", "../evil/../../users.csv", "text/csv; charset=UTF-8", csvPayload);

    assertThat(storedCsv.storageKey()).startsWith("exports/");
    assertThat(storedCsv.storageKey()).doesNotContain("..");
    assertThat(storedCsv.originalFilename()).isEqualTo("users.csv");
    assertThat(storedCsv.contentType()).isEqualTo("text/csv");
    assertThat(storedCsv.sizeBytes()).isEqualTo(csvPayload.length);
    assertThat(adapter.read(storedCsv.storageKey())).isEqualTo(csvPayload);

    adapter.delete(storedCsv.storageKey());
    assertThatThrownBy(() -> adapter.read(storedCsv.storageKey()))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("文件不存在");

    assertThat(adapter.store("img", "photo.png", "image/png", PNG_BYTES).sizeBytes())
        .isEqualTo(PNG_BYTES.length);
    assertThat(adapter.store("img", "photo.jpg", "image/jpeg", JPEG_BYTES).sizeBytes())
        .isEqualTo(JPEG_BYTES.length);
    assertThat(adapter.store("img", "photo.webp", "image/webp", WEBP_BYTES).sizeBytes())
        .isEqualTo(WEBP_BYTES.length);
    assertThat(adapter.store("doc", "spec.pdf", "application/pdf", PDF_BYTES).sizeBytes())
        .isEqualTo(PDF_BYTES.length);
    assertThat(
            adapter
                .store(
                    "cfg",
                    "manifest.json",
                    "application/json",
                    "{\"ok\":true,\"items\":[1,2]}".getBytes(StandardCharsets.UTF_8))
                .contentType())
        .isEqualTo("application/json");
  }

  @Test
  void blocksPathTraversalInvalidCategoryDisallowedMimeAndOversizedFiles() {
    LocalFileStorageAdapter adapter = createAdapter(16);
    byte[] small = "hello".getBytes(StandardCharsets.UTF_8);

    assertThatThrownBy(() -> adapter.store("../escape", "a.txt", "text/plain", small))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("非法的文件存储分类");

    assertThatThrownBy(() -> adapter.store("docs", "script.html", "text/html", small))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("不支持的文件类型");

    assertThatThrownBy(() -> adapter.store("bin", "raw.bin", "application/octet-stream", small))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("不支持的文件类型");

    assertThatThrownBy(
            () ->
                adapter.store(
                    "docs",
                    "big.txt",
                    "text/plain",
                    "01234567890123456789".getBytes(StandardCharsets.UTF_8)))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("大小超过上限");

    assertThatThrownBy(() -> adapter.read("../outside.txt"))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("路径穿越");
  }

  @Test
  void rejectsSpoofedMagicBytesActiveMarkupInvalidUtf8AndMismatchedExtensions() {
    LocalFileStorageAdapter adapter = createAdapter(4096);

    assertThatThrownBy(
            () ->
                adapter.store(
                    "img",
                    "fake.png",
                    "image/png",
                    "not-a-png-header".getBytes(StandardCharsets.UTF_8)))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("PNG 文件签名校验失败");

    assertThatThrownBy(() -> adapter.store("img", "mismatch.jpg", "image/png", PNG_BYTES))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("不匹配");

    assertThatThrownBy(
            () ->
                adapter.store(
                    "doc",
                    "xss.txt",
                    "text/plain",
                    "  <script>alert(1)</script>".getBytes(StandardCharsets.UTF_8)))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("活跃标记");

    assertThatThrownBy(
            () ->
                adapter.store(
                    "doc",
                    "svg.txt",
                    "text/plain",
                    "<svg onload=alert(1)>".getBytes(StandardCharsets.UTF_8)))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("活跃标记");

    assertThatThrownBy(
            () ->
                adapter.store(
                    "doc",
                    "bad-utf8.txt",
                    "text/plain",
                    new byte[] {(byte) 0xFF, (byte) 0xFE, 0x00, 0x41}))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("UTF-8");

    assertThatThrownBy(
            () ->
                adapter.store(
                    "cfg",
                    "broken.json",
                    "application/json",
                    "{\"a\":1}{}".getBytes(StandardCharsets.UTF_8)))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("JSON");
  }
}
