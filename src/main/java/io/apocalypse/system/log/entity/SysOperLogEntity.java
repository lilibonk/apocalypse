package io.apocalypse.system.log.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/**
 * 操作日志（对应 {@code sys_oper_log}）。纯追加日志表：不继承 {@code BaseEntity}， 无 version/deleted/update 审计字段，只插不改。
 */
@Getter
@Setter
@TableName("sys_oper_log")
public class SysOperLogEntity implements Serializable {

  @TableId(type = IdType.ASSIGN_ID)
  private Long id;

  private String title;

  private String businessType;

  private String method;

  private String operName;

  private String operIp;

  /** 请求参数 JSON（敏感值已脱敏为 ***）。 */
  private String operParam;

  private String operResult;

  /** 状态：1=成功 0=失败。 */
  private Integer status;

  private String errorMsg;

  private LocalDateTime operTime;

  /** 耗时（毫秒）。 */
  private Long costTime;
}
