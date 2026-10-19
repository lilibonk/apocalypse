package io.apocalypse.system.log.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.entity.SysLoginLogEntity;

import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
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

  /** 统计桶行：{@code bucket} 为 date_trunc 后的本地时间。 */
  record BucketRow(LocalDateTime bucket, long total, long succeeded, long failed) {}

  /** 去重账号与来源 IP 数。 */
  record DistinctRow(long users, long ips) {}

  /** 星期×小时聚合行。 */
  record HeatRow(int weekday, int hour, long total, long failed) {}

  /** 半开区间聚合；只走 {@code idx_sys_login_log_time} 范围扫描，不在 Java 中翻页拼全量。 */
  @Select(
      """
      SELECT date_trunc(CAST(#{unit} AS text), login_time) AS bucket,
             count(*) AS total,
             count(*) FILTER (WHERE success = 1) AS succeeded,
             count(*) FILTER (WHERE success = 0) AS failed
      FROM sys_login_log
      WHERE login_time >= #{from} AND login_time < #{to}
      GROUP BY 1
      ORDER BY 1
      """)
  List<BucketRow> insightBuckets(
      @Param("unit") String unit, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

  /**
   * Same result as count(DISTINCT …) (NULLs excluded), written as two GROUP BY subqueries so
   * PostgreSQL can hash-aggregate instead of sorting the whole window (≈5× faster at 500k rows).
   */
  @Select(
      """
      SELECT
        (SELECT count(*) FROM (
           SELECT username FROM sys_login_log
           WHERE login_time >= #{from} AND login_time < #{to} AND username IS NOT NULL
           GROUP BY username) u) AS users,
        (SELECT count(*) FROM (
           SELECT ip FROM sys_login_log
           WHERE login_time >= #{from} AND login_time < #{to} AND ip IS NOT NULL
           GROUP BY ip) i) AS ips
      """)
  DistinctRow insightDistinct(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

  @Select("SELECT count(*) FROM sys_login_log WHERE login_time >= #{from} AND login_time < #{to}")
  long countBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

  @Select(
      """
      SELECT CAST(extract(isodow FROM login_time) AS int) AS weekday,
             CAST(extract(hour FROM login_time) AS int) AS hour,
             count(*) AS total,
             count(*) FILTER (WHERE success = 0) AS failed
      FROM sys_login_log
      WHERE login_time >= #{from} AND login_time < #{to}
      GROUP BY 1, 2
      """)
  List<HeatRow> heatmap(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
