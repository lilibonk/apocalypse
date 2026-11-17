package io.apocalypse.system.log.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.entity.SysOperLogEntity;

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

  @Delete(
      """
      DELETE FROM sys_oper_log
      WHERE id IN (
        SELECT id FROM sys_oper_log
        WHERE oper_time < #{cutoff}
        ORDER BY oper_time ASC
        LIMIT #{limit}
      )
      """)
  int deleteBatchBefore(@Param("cutoff") LocalDateTime cutoff, @Param("limit") int limit);

  /** 按操作人关键字分页（按操作时间倒序）。 */
  default PageResult<SysOperLogEntity> pageByKeyword(int page, int size, String keyword) {
    return pageByFilters(page, size, keyword, null, null, null, null);
  }

  /** 按多维条件分页查询操作日志（关键字匹配 title / operName / method，支持业务类型、成败状态与半开时间区间下钻）。 */
  default PageResult<SysOperLogEntity> pageByFilters(
      int page,
      int size,
      String keyword,
      String businessType,
      Integer status,
      LocalDateTime from,
      LocalDateTime to) {
    LambdaQueryWrapper<SysOperLogEntity> wrapper = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      String kw = keyword.trim();
      wrapper.and(
          w ->
              w.like(SysOperLogEntity::getTitle, kw)
                  .or()
                  .like(SysOperLogEntity::getOperName, kw)
                  .or()
                  .like(SysOperLogEntity::getMethod, kw));
    }
    if (StringUtils.hasText(businessType)) {
      wrapper.eq(SysOperLogEntity::getBusinessType, businessType.trim());
    }
    if (status != null) {
      wrapper.eq(SysOperLogEntity::getStatus, status);
    }
    if (from != null) {
      wrapper.ge(SysOperLogEntity::getOperTime, from);
    }
    if (to != null) {
      wrapper.lt(SysOperLogEntity::getOperTime, to);
    }
    wrapper.orderByDesc(SysOperLogEntity::getOperTime).orderByDesc(SysOperLogEntity::getId);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }

  /** 统计桶行：状态 1=成功、0=失败，其余计入未知。 */
  record BucketRow(LocalDateTime bucket, long total, long succeeded, long failed) {}

  /** 业务类型计数；空白类型归一为 null。 */
  record TypeRow(String type, long count) {}

  /** 半开区间聚合；只走 {@code idx_sys_oper_log_time} 范围扫描。 */
  @Select(
      """
      SELECT date_trunc(CAST(#{unit} AS text), oper_time) AS bucket,
             count(*) AS total,
             count(*) FILTER (WHERE status = 1) AS succeeded,
             count(*) FILTER (WHERE status = 0) AS failed
      FROM sys_oper_log
      WHERE oper_time >= #{from} AND oper_time < #{to}
      GROUP BY 1
      ORDER BY 1
      """)
  List<BucketRow> insightBuckets(
      @Param("unit") String unit, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

  @Select("SELECT count(*) FROM sys_oper_log WHERE oper_time >= #{from} AND oper_time < #{to}")
  long countBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

  @Select(
      """
      SELECT NULLIF(btrim(business_type), '') AS type, count(*) AS count
      FROM sys_oper_log
      WHERE oper_time >= #{from} AND oper_time < #{to}
      GROUP BY 1
      ORDER BY 2 DESC, 1 NULLS LAST
      """)
  List<TypeRow> typeCounts(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
