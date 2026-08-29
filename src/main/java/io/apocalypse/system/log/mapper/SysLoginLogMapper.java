package io.apocalypse.system.log.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.entity.SysLoginLogEntity;

import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 登录日志 Mapper（纯追加表，只有查询与插入）。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysLoginLogMapper extends BaseMapper<SysLoginLogEntity> {

  /** 按登录名关键字分页（按登录时间倒序）。 */
  default PageResult<SysLoginLogEntity> pageByKeyword(int page, int size, String keyword) {
    LambdaQueryWrapper<SysLoginLogEntity> wrapper = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      wrapper.like(SysLoginLogEntity::getUsername, keyword);
    }
    wrapper.orderByDesc(SysLoginLogEntity::getLoginTime);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }
}
