package io.apocalypse.system.log.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/**
 * 登录日志（对应 {@code sys_login_log}）。纯追加日志表：不继承 {@code BaseEntity}， 无 version/deleted/update 审计字段，只插不改。
 */
@Getter
@Setter
@TableName("sys_login_log")
public class SysLoginLogEntity implements Serializable {

  @TableId(type = IdType.ASSIGN_ID)
  private Long id;

  private String eventId;

  private String username;

  private String ip;

  private String userAgent;

  /** 是否成功：1=成功 0=失败。 */
  private Integer success;

  private String message;

  private LocalDateTime loginTime;
}
