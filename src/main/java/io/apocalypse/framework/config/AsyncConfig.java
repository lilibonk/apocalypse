package io.apocalypse.framework.config;

import java.util.Map;
import java.util.concurrent.ThreadPoolExecutor;

import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 异步与调度装配：Modulith {@code @ApplicationModuleListener} 依赖 {@code @EnableAsync}（事务提交后异步消费事件）。
 *
 * <p>显式装配有界 {@link ThreadPoolTaskExecutor} + MDC {@code traceId} 透传装饰器 + 优雅停机等待， 避免默认无界异步执行器在审计洪峰下
 * OOM 或丢失请求链路追踪上下文。
 */
@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfig {

  @Bean(name = {"applicationTaskExecutor", "taskExecutor"})
  public ThreadPoolTaskExecutor applicationTaskExecutor(
      @Value("${apocalypse.async.core-pool-size:4}") int corePoolSize,
      @Value("${apocalypse.async.max-pool-size:16}") int maxPoolSize,
      @Value("${apocalypse.async.queue-capacity:500}") int queueCapacity,
      @Value("${apocalypse.async.await-termination-seconds:30}") int awaitTerminationSeconds) {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(corePoolSize);
    executor.setMaxPoolSize(maxPoolSize);
    executor.setQueueCapacity(queueCapacity);
    executor.setThreadNamePrefix("apoc-async-");
    executor.setTaskDecorator(mdcTaskDecorator());
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(awaitTerminationSeconds);
    executor.initialize();
    return executor;
  }

  static TaskDecorator mdcTaskDecorator() {
    return runnable -> {
      Map<String, String> contextMap = MDC.getCopyOfContextMap();
      return () -> {
        Map<String, String> previous = MDC.getCopyOfContextMap();
        if (contextMap != null) {
          MDC.setContextMap(contextMap);
        } else {
          MDC.clear();
        }
        try {
          runnable.run();
        } finally {
          if (previous != null) {
            MDC.setContextMap(previous);
          } else {
            MDC.clear();
          }
        }
      };
    };
  }
}
