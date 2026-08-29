package io.apocalypse.system.config.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.config.entity.SysConfigEntity;

import java.util.Optional;

import org.apache.ibatis.annotations.Param;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 参数配置 Mapper。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysConfigMapper extends BaseMapper<SysConfigEntity> {

  /** 按参数键/名称关键字分页。 */
  default PageResult<SysConfigEntity> pageByKeyword(int page, int size, String keyword) {
    LambdaQueryWrapper<SysConfigEntity> wrapper = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      wrapper
          .like(SysConfigEntity::getConfigKey, keyword)
          .or()
          .like(SysConfigEntity::getConfigName, keyword);
    }
    wrapper.orderByAsc(SysConfigEntity::getConfigKey);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }

  /** 按参数键查询。 */
  default Optional<SysConfigEntity> findByKey(@Param("configKey") String configKey) {
    return Optional.ofNullable(
        selectOne(
            new LambdaQueryWrapper<SysConfigEntity>()
                .eq(SysConfigEntity::getConfigKey, configKey)));
  }

  /** 参数键是否已存在。 */
  default boolean existsByKey(@Param("configKey") String configKey) {
    return selectCount(
            new LambdaQueryWrapper<SysConfigEntity>().eq(SysConfigEntity::getConfigKey, configKey))
        > 0;
  }
}
