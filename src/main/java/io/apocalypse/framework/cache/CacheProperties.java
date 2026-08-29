package io.apocalypse.framework.cache;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/** 两级缓存配置（{@code apocalypse.cache}）。 L1=Caffeine 进程内，L2=Redis。 */
@Getter
@Setter
@ConfigurationProperties("apocalypse.cache")
public class CacheProperties {

  private L1 l1 = new L1();

  private L2 l2 = new L2();

  /** TTL 随机抖动比例（0~1），防缓存雪崩：实际 TTL = 基础值 × (1±ratio)。 */
  private double ttlJitterRatio = 0.2;

  /** 是否缓存空值（防缓存穿透）。 */
  private boolean allowNullValues = true;

  @Getter
  @Setter
  public static class L1 {

    /** Caffeine 最大条目数。 */
    private long maxSize = 10_000;

    /** L1 过期秒数（写入后）。 */
    private long expireSeconds = 300;
  }

  @Getter
  @Setter
  public static class L2 {

    /** Redis 过期秒数（基础值，叠加抖动）。 */
    private long expireSeconds = 1800;
  }
}
