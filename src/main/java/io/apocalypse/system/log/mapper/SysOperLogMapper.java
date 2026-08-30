package io.apocalypse.system.log.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.entity.SysOperLogEntity;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 操作日志 Mapper（纯追加表，只有查询与插入）。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysOperLogMapper extends BaseMapper<SysOperLogEntity> {

  /**
   * 按事件 ID 幂等写入。Modulith 可能重投未确认事件，数据库唯一键是最终幂等边界。
   *
   * @return 1=首次写入，0=重复事件
   */
  default int insertIdempotent(SysOperLogEntity entity) {
    if (entity.getId() == null) {
      entity.setId(IdWorker.getId());
    }
    return insertIgnoringDuplicateEvent(entity);
  }

  @Insert(
      """
      INSERT INTO sys_oper_log
          (id, event_id, title, business_type, method, oper_name, oper_ip, oper_param,
           oper_result, status, error_msg, oper_time, cost_time)
      VALUES
          (#{id}, CAST(#{eventId} AS UUID), #{title}, #{businessType}, #{method}, #{operName}, #{operIp},
           #{operParam}, #{operResult}, #{status}, #{errorMsg}, #{operTime}, #{costTime})
      ON CONFLICT (event_id) DO NOTHING
      """)
  int insertIgnoringDuplicateEvent(SysOperLogEntity entity);

  @Delete("DELETE FROM sys_oper_log WHERE oper_time < #{cutoff}")
  int deleteBefore(java.time.LocalDateTime cutoff);

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
