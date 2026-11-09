package io.apocalypse.framework.config;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import static org.assertj.core.api.Assertions.assertThat;

class AsyncConfigTest {

  @Test
  void boundedExecutorPropagatesAndRestoresMdcTraceId() throws Exception {
    AsyncConfig config = new AsyncConfig();
    ThreadPoolTaskExecutor executor = config.applicationTaskExecutor(2, 4, 50, 5);
    try {
      MDC.put("traceId", "trace-w5-12345");
      AtomicReference<String> asyncTraceId = new AtomicReference<>();
      CompletableFuture<Void> future =
          CompletableFuture.runAsync(() -> asyncTraceId.set(MDC.get("traceId")), executor);
      future.get(5, TimeUnit.SECONDS);
      assertThat(asyncTraceId.get()).isEqualTo("trace-w5-12345");
    } finally {
      MDC.clear();
      executor.shutdown();
    }
  }
}
