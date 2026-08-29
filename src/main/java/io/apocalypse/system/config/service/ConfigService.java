package io.apocalypse.system.config.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.config.dto.request.ConfigSaveReq;
import io.apocalypse.system.config.dto.response.ConfigResp;
import io.apocalypse.system.config.entity.SysConfigEntity;
import io.apocalypse.system.config.mapper.SysConfigMapper;

import java.util.Locale;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * 参数配置服务（仅业务可调参数；技术装配走 application-*.yml）。 {@link #get(String)} 走两级缓存（config， 含空值缓存防穿透），写操作
 * evict：增/改按 key 精确失效，删除时 key 不可见故整体失效。
 */
@Service
@RequiredArgsConstructor
public class ConfigService {

  private final SysConfigMapper sysConfigMapper;

  private final ConfigConvert configConvert;

  /** 按参数键取值，不存在返回 null（null 也会被缓存，防止穿透）。 */
  @Cacheable(cacheNames = "config", key = "#key")
  public String get(String key) {
    return sysConfigMapper.findByKey(key).map(SysConfigEntity::getConfigValue).orElse(null);
  }

  /** 按参数键取整数值；不存在返回 null，值非数字时抛业务异常。 */
  public Integer getInt(String key) {
    String value = get(key);
    if (value == null) {
      return null;
    }
    try {
      return Integer.valueOf(value.trim());
    } catch (NumberFormatException e) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "参数值不是合法数字: " + key);
    }
  }

  /** 按参数键取布尔值（true/1/yes/on 视为真，大小写不敏感）；不存在返回 null。 */
  public Boolean getBool(String key) {
    String value = get(key);
    if (value == null) {
      return null;
    }
    String normalized = value.trim().toLowerCase(Locale.ROOT);
    return switch (normalized) {
      case "true", "1", "yes", "on" -> true;
      case "false", "0", "no", "off" -> false;
      default -> throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "参数值不是合法布尔值: " + key);
    };
  }

  /** 分页查询。 */
  public PageResult<ConfigResp> page(int page, int size, String keyword) {
    return sysConfigMapper.pageByKeyword(page, size, keyword).map(configConvert::toResp);
  }

  /** 按参数键读取视图。 */
  public ConfigResp getByKey(String key) {
    return sysConfigMapper
        .findByKey(key)
        .map(configConvert::toResp)
        .orElseThrow(() -> new BizException(ErrorCode.NOT_FOUND.getCode(), "参数不存在"));
  }

  /** 新增参数，返回主键；evict 同 key 可能存在的空值缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "config", key = "#req.configKey()")
  public Long create(ConfigSaveReq req) {
    if (sysConfigMapper.existsByKey(req.configKey())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "参数键已存在");
    }
    SysConfigEntity entity = new SysConfigEntity();
    applyReq(entity, req);
    sysConfigMapper.insert(entity);
    return entity.getId();
  }

  /** 更新参数；evict 对应 key 缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "config", key = "#req.configKey()")
  public void update(Long id, ConfigSaveReq req) {
    SysConfigEntity entity = requireById(id);
    if (!entity.getConfigKey().equals(req.configKey())
        && sysConfigMapper.existsByKey(req.configKey())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "参数键已存在");
    }
    applyReq(entity, req);
    sysConfigMapper.updateById(entity);
  }

  /** 删除参数（逻辑删）；key 不在入参中，简单起见整体失效。 */
  @Transactional
  @CacheEvict(cacheNames = "config", allEntries = true)
  public void delete(Long id) {
    requireById(id);
    sysConfigMapper.deleteById(id);
  }

  private SysConfigEntity requireById(Long id) {
    SysConfigEntity entity = sysConfigMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "参数不存在");
    }
    return entity;
  }

  private static void applyReq(SysConfigEntity entity, ConfigSaveReq req) {
    entity.setConfigKey(req.configKey());
    entity.setConfigName(req.configName());
    entity.setConfigValue(req.configValue());
    entity.setRemark(req.remark());
  }
}
