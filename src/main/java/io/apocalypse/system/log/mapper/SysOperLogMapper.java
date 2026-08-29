package io.apocalypse.system.log.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.entity.SysOperLogEntity;

import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 操作日志 Mapper（纯追加表，只有查询与插入）。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysOperLogMapper extends BaseMapper<SysOperLogEntity> {

  /** 按操作人关键字分页（按操作时间倒序）。 */
  default PageResult<SysOperLogEntity> pageByKeyword(int page, int size, String keyword) {
    LambdaQueryWrapper<SysOperLogEntity> wrapper = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      wrapper.like(SysOperLogEntity::getOperName, keyword);
    }
    wrapper.orderByDesc(SysOperLogEntity::getOperTime);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }
}
