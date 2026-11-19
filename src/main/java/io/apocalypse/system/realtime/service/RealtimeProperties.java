package io.apocalypse.system.realtime.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/** SSE 实时脉冲通道配置属性（{@code apocalypse.realtime.*}）。 */
@Getter
@Setter
@ConfigurationProperties(prefix = "apocalypse.realtime")
public class RealtimeProperties {

  /** 单个 SSE 流空闲超时（毫秒，默认 5 分钟）。 */
  private long streamTimeoutMs = 300_000L;

  /** 心跳保活与过期驱逐调度间隔（毫秒，默认 25 秒）。 */
  private long heartbeatIntervalMs = 25_000L;

  /** 同一账号最多保留的并发 SSE 连接数，超出时驱逐最早连接。 */
  private int maxConnectionsPerUser = 5;

  /** 单实例全局最大并发 SSE 连接数，达到上限后拒绝新订阅（HTTP 429）。 */
  private int maxTotalConnections = 500;
}
