package io.apocalypse.system.dict.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.dict.dto.request.DictDataSaveReq;
import io.apocalypse.system.dict.dto.request.DictTypeSaveReq;
import io.apocalypse.system.dict.dto.response.DictDataResp;
import io.apocalypse.system.dict.dto.response.DictTypeResp;
import io.apocalypse.system.dict.entity.SysDictDataEntity;
import io.apocalypse.system.dict.entity.SysDictTypeEntity;
import io.apocalypse.system.dict.mapper.SysDictDataMapper;
import io.apocalypse.system.dict.mapper.SysDictTypeMapper;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * 字典服务：字典类型/数据 CRUD 与按类型取下拉项。 {@link #getByType(String)} 走两级缓存（dict）， 数据写操作按类型 key evict；类型级联变更/删除时
 * key 不可枚举，整体失效。
 */
@Service
@RequiredArgsConstructor
public class DictService {

  private final SysDictTypeMapper sysDictTypeMapper;

  private final SysDictDataMapper sysDictDataMapper;

  private final DictConvert dictConvert;

  /** 按类型取有效字典项（下拉用，两级缓存）。 */
  @Cacheable(cacheNames = "dict", key = "#type", sync = true)
  public List<DictDataResp> getByType(String type) {
    return sysDictDataMapper.findEnabledByType(type).stream().map(dictConvert::toDataResp).toList();
  }

  /** 按多个字典类型批量取全部未删除字典项（含启用与停用，供字典样本册一次拉取）。 */
  public Map<String, List<DictDataResp>> getBatchByTypes(Collection<String> dictTypes) {
    if (dictTypes == null || dictTypes.isEmpty()) {
      return Map.of();
    }
    List<String> normalized =
        dictTypes.stream()
            .filter(t -> t != null && !t.isBlank())
            .map(String::trim)
            .distinct()
            .toList();
    if (normalized.isEmpty()) {
      return Map.of();
    }
    Map<String, List<DictDataResp>> grouped = new LinkedHashMap<>();
    for (String type : normalized) {
      grouped.put(type, new ArrayList<>());
    }
    for (SysDictDataEntity entity : sysDictDataMapper.findAllByTypes(normalized)) {
      grouped
          .computeIfAbsent(entity.getDictType(), ignored -> new ArrayList<>())
          .add(dictConvert.toDataResp(entity));
    }
    Map<String, List<DictDataResp>> result = new LinkedHashMap<>();
    grouped.forEach((k, v) -> result.put(k, List.copyOf(v)));
    return result;
  }

  /** 字典类型分页。 */
  public PageResult<DictTypeResp> pageTypes(int page, int size, String keyword) {
    return sysDictTypeMapper.pageByKeyword(page, size, keyword).map(dictConvert::toTypeResp);
  }

  /** 新增字典类型，返回主键。 */
  @Transactional
  public Long createType(DictTypeSaveReq req) {
    if (sysDictTypeMapper.existsByType(req.dictType())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "字典类型已存在");
    }
    SysDictTypeEntity entity = new SysDictTypeEntity();
    applyTypeReq(entity, req);
    sysDictTypeMapper.insert(entity);
    return entity.getId();
  }

  /** 更新字典类型；类型标识变更时级联更新数据行（缓存 key 随类型变化，整体失效）。 */
  @Transactional
  @CacheEvict(cacheNames = "dict", allEntries = true)
  public void updateType(Long id, DictTypeSaveReq req) {
    SysDictTypeEntity entity = requireTypeById(id);
    if (!entity.getDictType().equals(req.dictType())) {
      if (sysDictTypeMapper.existsByType(req.dictType())) {
        throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "字典类型已存在");
      }
      sysDictDataMapper.updateTypeByType(entity.getDictType(), req.dictType());
    }
    applyTypeReq(entity, req);
    ConcurrencyGuard.requireSingleRow(sysDictTypeMapper.updateById(entity));
  }

  /** 删除字典类型（逻辑删，级联逻辑删数据行；缓存 key 不可枚举，整体失效）。 */
  @Transactional
  @CacheEvict(cacheNames = "dict", allEntries = true)
  public void deleteType(Long id) {
    SysDictTypeEntity entity = requireTypeById(id);
    sysDictDataMapper.deleteByType(entity.getDictType());
    ConcurrencyGuard.requireSingleRow(sysDictTypeMapper.deleteById(id));
  }

  /** 字典数据分页。 */
  public PageResult<DictDataResp> pageData(int page, int size, String dictType) {
    return sysDictDataMapper.pageByType(page, size, dictType).map(dictConvert::toDataResp);
  }

  /** 新增字典数据，返回主键；evict 对应类型缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "dict", key = "#req.dictType()")
  public Long createData(DictDataSaveReq req) {
    requireType(req.dictType());
    SysDictDataEntity entity = new SysDictDataEntity();
    applyDataReq(entity, req);
    if (Integer.valueOf(SysDictDataEntity.IS_DEFAULT_YES).equals(entity.getIsDefault())) {
      sysDictDataMapper.clearDefaultByType(entity.getDictType(), null);
    }
    sysDictDataMapper.insert(entity);
    return entity.getId();
  }

  /** 更新字典数据；evict 对应类型缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "dict", key = "#req.dictType()")
  public void updateData(Long id, DictDataSaveReq req) {
    SysDictDataEntity entity = requireDataById(id);
    applyDataReq(entity, req);
    if (Integer.valueOf(SysDictDataEntity.IS_DEFAULT_YES).equals(entity.getIsDefault())) {
      sysDictDataMapper.clearDefaultByType(entity.getDictType(), id);
    }
    ConcurrencyGuard.requireSingleRow(sysDictDataMapper.updateById(entity));
  }

  /** 删除字典数据（逻辑删）；行的类型不在入参中，简单起见整体失效。 */
  @Transactional
  @CacheEvict(cacheNames = "dict", allEntries = true)
  public void deleteData(Long id) {
    requireDataById(id);
    ConcurrencyGuard.requireSingleRow(sysDictDataMapper.deleteById(id));
  }

  private SysDictTypeEntity requireTypeById(Long id) {
    SysDictTypeEntity entity = sysDictTypeMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "字典类型不存在");
    }
    return entity;
  }

  private SysDictDataEntity requireDataById(Long id) {
    SysDictDataEntity entity = sysDictDataMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "字典数据不存在");
    }
    return entity;
  }

  /** 字典数据归属的类型必须存在。 */
  private void requireType(String dictType) {
    if (sysDictTypeMapper.findByType(dictType).isEmpty()) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "字典类型不存在");
    }
  }

  private static void applyTypeReq(SysDictTypeEntity entity, DictTypeSaveReq req) {
    entity.setDictType(req.dictType());
    entity.setDictName(req.dictName());
    entity.setStatus(req.status() == null ? SysDictTypeEntity.STATUS_ENABLED : req.status());
    entity.setRemark(req.remark());
  }

  private static void applyDataReq(SysDictDataEntity entity, DictDataSaveReq req) {
    entity.setDictType(req.dictType());
    entity.setDictLabel(req.dictLabel());
    entity.setDictValue(req.dictValue());
    entity.setSort(req.sort() == null ? 0 : req.sort());
    entity.setStatus(req.status() == null ? SysDictDataEntity.STATUS_ENABLED : req.status());
    entity.setTagTone(
        (req.tagTone() == null || req.tagTone().isBlank())
            ? SysDictDataEntity.DEFAULT_TAG_TONE
            : req.tagTone());
    entity.setIsDefault(
        req.isDefault() == null ? SysDictDataEntity.IS_DEFAULT_NO : req.isDefault());
    entity.setRemark(req.remark());
  }
}
