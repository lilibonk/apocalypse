package io.apocalypse.system.log.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.entity.SysLoginLogEntity;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 登录日志 Mapper（纯追加表，只有查询与插入）。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysLoginLogMapper extends BaseMapper<SysLoginLogEntity> {

  /**
   * 按事件 ID 幂等写入。Modulith 可能重投未确认事件，数据库唯一键是最终幂等边界。
   *
   * @return 1=首次写入，0=重复事件
   */
  default int insertIdempotent(SysLoginLogEntity entity) {
    if (entity.getId() == null) {
      entity.setId(IdWorker.getId());
    }
    return insertIgnoringDuplicateEvent(entity);
  }

  @Insert(
      """
      INSERT INTO sys_login_log
          (id, event_id, username, ip, user_agent, success, message, login_time)
      VALUES
          (#{id}, CAST(#{eventId} AS UUID), #{username}, #{ip}, #{userAgent}, #{success}, #{message}, #{loginTime})
      ON CONFLICT (event_id) DO NOTHING
      """)
  int insertIgnoringDuplicateEvent(SysLoginLogEntity entity);

  @Delete("DELETE FROM sys_login_log WHERE login_time < #{cutoff}")
  int deleteBefore(java.time.LocalDateTime cutoff);

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
