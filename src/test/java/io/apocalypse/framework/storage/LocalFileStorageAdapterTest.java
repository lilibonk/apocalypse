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

/** {@link LocalFileStorageAdapter} 单元测试（路径穿越防御、MIME 白名单、大小上限与往返读写）。 */
class LocalFileStorageAdapterTest {

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
  void storesReadsAndDeletesValidFileSafely() {
    LocalFileStorageAdapter adapter = createAdapter(1024);
    byte[] payload = "id,username\n1,admin\n".getBytes(StandardCharsets.UTF_8);

    StoredFile stored =
        adapter.store("exports", "../evil/../../users.csv", "text/csv; charset=UTF-8", payload);

    assertThat(stored.storageKey()).startsWith("exports/");
    assertThat(stored.storageKey()).doesNotContain("..");
    assertThat(stored.originalFilename()).isEqualTo("users.csv");
    assertThat(stored.contentType()).isEqualTo("text/csv");
    assertThat(stored.sizeBytes()).isEqualTo(payload.length);
    assertThat(adapter.read(stored.storageKey())).isEqualTo(payload);

    adapter.delete(stored.storageKey());
    assertThatThrownBy(() -> adapter.read(stored.storageKey()))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("文件不存在");
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
}
