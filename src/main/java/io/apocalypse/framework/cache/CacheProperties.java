package io.apocalypse.framework.cache;

import java.util.LinkedHashMap;
import java.util.Map;

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

  /** 按缓存名的覆盖项（{@code apocalypse.cache.caches.<name>}）；未列出的缓存使用全局设置。 */
  private Map<String, CacheSpec> caches = new LinkedHashMap<>();

  /** 返回该缓存的最大年龄秒数；未配置时为 {@code null}（沿用全局 TTL 语义）。 */
  public Long maxAgeSeconds(String cacheName) {
    CacheSpec spec = caches.get(cacheName);
    return spec == null ? null : spec.getMaxAgeSeconds();
  }

  @Getter
  @Setter
  public static class CacheSpec {

    /** 最大年龄：任一层都不返回计算后超过该秒数的值。L1 写后过期取全局 L1 与此值的较小者；L2 TTL 只向下抖动；L2 命中不回填 L1 （条目年龄未知）。 */
    private Long maxAgeSeconds;
  }

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
