package io.apocalypse.system.authorization.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 纯追加授权审计，eventId 是可靠重投幂等键。 */
@Getter
@Setter
@TableName("sys_authorization_audit")
public class AuthorizationAuditEntity implements Serializable {
  @TableId(type = IdType.ASSIGN_ID)
  private Long id;

  private String eventId;

  private LocalDateTime occurredAt;

  private Long actorId;

  private String subjectType;

  private Long subjectId;

  private Long beforeRevision;

  private Long afterRevision;

  private String beforeConfiguration;

  private String afterConfiguration;

  private String diffHash;

  private String requestId;
}
