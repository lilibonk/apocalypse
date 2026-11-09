package io.apocalypse.framework.redis;

import java.util.ArrayList;
import java.util.List;

import org.springframework.util.Assert;

/**
 * 业务模块向 {@link SafeRedisValueSerializer} 声明允许写入 L2 Redis 缓存的值类型。
 *
 * <p>与 {@code PermissionActionDefinition} 同构：各业务模块在自身 {@code @ModuleConfiguration} 中通过
 * {@code @Bean} 注册显式 {@code typeId -> Class} 映射，无需跨模块修改 {@code framework.redis} 内部白名单，同时保持“拒绝载荷内任意
 * Java 类名反序列化”的安全红线。
 */
public record RedisCacheTypeRegistration(List<Entry> entries) {

  public RedisCacheTypeRegistration {
    Assert.notNull(entries, "RedisCacheTypeRegistration entries must not be null");
    entries = List.copyOf(entries);
  }

  public record Entry(String typeId, String className, boolean list) {
    public Entry {
      Assert.hasText(typeId, "Redis cache typeId must not be blank");
      Assert.hasText(className, "Redis cache className must not be blank");
    }
  }

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private final List<Entry> entries = new ArrayList<>();

    private Builder() {}

    public Builder single(String typeId, Class<?> type) {
      Assert.notNull(type, "Redis cache type must not be null");
      return singleClassName(typeId, type.getName());
    }

    public Builder singleClassName(String typeId, String className) {
      entries.add(new Entry(typeId, className, false));
      return this;
    }

    public Builder list(String typeId, Class<?> elementType) {
      Assert.notNull(elementType, "Redis cache list elementType must not be null");
      return listClassName(typeId, elementType.getName());
    }

    public Builder listClassName(String typeId, String elementClassName) {
      entries.add(new Entry(typeId, elementClassName, true));
      return this;
    }

    public RedisCacheTypeRegistration build() {
      return new RedisCacheTypeRegistration(entries);
    }
  }
}
