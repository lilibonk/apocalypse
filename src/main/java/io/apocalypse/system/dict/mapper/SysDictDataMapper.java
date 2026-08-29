package io.apocalypse.system.dict.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.dict.entity.SysDictDataEntity;

import java.util.List;

import org.apache.ibatis.annotations.Param;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 字典数据 Mapper。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysDictDataMapper extends BaseMapper<SysDictDataEntity> {

  /** 按字典类型分页。 */
  default PageResult<SysDictDataEntity> pageByType(int page, int size, String dictType) {
    LambdaQueryWrapper<SysDictDataEntity> wrapper = new LambdaQueryWrapper<>();
    if (dictType != null && !dictType.isBlank()) {
      wrapper.eq(SysDictDataEntity::getDictType, dictType);
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
