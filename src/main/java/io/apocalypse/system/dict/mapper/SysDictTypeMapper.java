package io.apocalypse.system.dict.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.dict.entity.SysDictTypeEntity;

import java.util.Optional;

import org.apache.ibatis.annotations.Param;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 字典类型 Mapper。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysDictTypeMapper extends BaseMapper<SysDictTypeEntity> {

  /** 按类型标识/名称关键字分页。 */
  default PageResult<SysDictTypeEntity> pageByKeyword(int page, int size, String keyword) {
    LambdaQueryWrapper<SysDictTypeEntity> wrapper = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      wrapper
          .like(SysDictTypeEntity::getDictType, keyword)
          .or()
          .like(SysDictTypeEntity::getDictName, keyword);
    }
    wrapper.orderByAsc(SysDictTypeEntity::getDictType);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }

  /** 按类型标识查询。 */
  default Optional<SysDictTypeEntity> findByType(@Param("dictType") String dictType) {
    return Optional.ofNullable(
        selectOne(
            new LambdaQueryWrapper<SysDictTypeEntity>()
                .eq(SysDictTypeEntity::getDictType, dictType)));
  }

  /** 类型标识是否已存在。 */
  default boolean existsByType(@Param("dictType") String dictType) {
    return selectCount(
            new LambdaQueryWrapper<SysDictTypeEntity>()
                .eq(SysDictTypeEntity::getDictType, dictType))
        > 0;
  }
}
