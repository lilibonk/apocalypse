package io.apocalypse.system.dict.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.dict.entity.SysDictDataEntity;

import java.util.Collection;
import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 字典数据 Mapper。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysDictDataMapper extends BaseMapper<SysDictDataEntity> {

  /** 按字典类型分页。 */
  default PageResult<SysDictDataEntity> pageByType(int page, int size, String dictType) {
    return pageByType(page, size, dictType, null, null);
  }

  /** 按字典类型、标签/键值关键字与状态分页。 */
  default PageResult<SysDictDataEntity> pageByType(
      int page, int size, String dictType, String keyword, Integer status) {
    LambdaQueryWrapper<SysDictDataEntity> wrapper = new LambdaQueryWrapper<>();
    if (dictType != null && !dictType.isBlank()) {
      wrapper.eq(SysDictDataEntity::getDictType, dictType);
    }
    if (status != null) {
      wrapper.eq(SysDictDataEntity::getStatus, status);
    }
    if (StringUtils.hasText(keyword)) {
      wrapper.and(
          term ->
              term.like(SysDictDataEntity::getDictLabel, keyword)
                  .or()
                  .like(SysDictDataEntity::getDictValue, keyword));
    }
    wrapper.orderByAsc(SysDictDataEntity::getDictType).orderByAsc(SysDictDataEntity::getSort);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }

  /** 按类型查全部有效字典项（下拉用，按 sort 排序）。 */
  default List<SysDictDataEntity> findEnabledByType(@Param("dictType") String dictType) {
    return selectList(
        new LambdaQueryWrapper<SysDictDataEntity>()
            .eq(SysDictDataEntity::getDictType, dictType)
            .eq(SysDictDataEntity::getStatus, SysDictDataEntity.STATUS_ENABLED)
            .orderByAsc(SysDictDataEntity::getSort));
  }

  /** 按多个类型批量查询全部未删除字典项（含启用与停用，按 dictType, sort, id 排序）。 */
  default List<SysDictDataEntity> findAllByTypes(Collection<String> dictTypes) {
    if (dictTypes == null || dictTypes.isEmpty()) {
      return List.of();
    }
    return selectList(
        new LambdaQueryWrapper<SysDictDataEntity>()
            .in(SysDictDataEntity::getDictType, dictTypes)
            .orderByAsc(SysDictDataEntity::getDictType)
            .orderByAsc(SysDictDataEntity::getSort)
            .orderByAsc(SysDictDataEntity::getId));
  }

  /** 将同一字典类型下其余字典项的默认标记重置为 0。 */
  default void clearDefaultByType(String dictType, Long excludeId) {
    SysDictDataEntity reset = new SysDictDataEntity();
    reset.setIsDefault(SysDictDataEntity.IS_DEFAULT_NO);
    LambdaQueryWrapper<SysDictDataEntity> wrapper =
        new LambdaQueryWrapper<SysDictDataEntity>()
            .eq(SysDictDataEntity::getDictType, dictType)
            .eq(SysDictDataEntity::getIsDefault, SysDictDataEntity.IS_DEFAULT_YES);
    if (excludeId != null) {
      wrapper.ne(SysDictDataEntity::getId, excludeId);
    }
    update(reset, wrapper);
  }

  /** 按类型删除（逻辑删，字典类型删除时级联）。 */
  default int deleteByType(@Param("dictType") String dictType) {
    return delete(
        new LambdaQueryWrapper<SysDictDataEntity>().eq(SysDictDataEntity::getDictType, dictType));
  }

  /** 按类型批量改类型标识（字典类型标识变更时级联）。 */
  default int updateTypeByType(@Param("oldType") String oldType, @Param("newType") String newType) {
    SysDictDataEntity update = new SysDictDataEntity();
    update.setDictType(newType);
    return update(
        update,
        new LambdaQueryWrapper<SysDictDataEntity>().eq(SysDictDataEntity::getDictType, oldType));
  }
}
