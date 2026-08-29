package io.apocalypse.framework.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/** 异步装配：Modulith {@code @ApplicationModuleListener} 依赖 {@code @EnableAsync}（事务提交后异步消费事件）。 */
@Configuration
@EnableAsync
public class AsyncConfig {}
