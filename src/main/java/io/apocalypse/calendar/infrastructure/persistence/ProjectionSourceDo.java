package io.apocalypse.calendar.infrastructure.persistence;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_projection_source")
public class ProjectionSourceDo {

  @TableId(type = IdType.ASSIGN_ID)
  private Long id;

  private Long calendarId;

  private Long eventId;

  private String sourceSystem;

  private String sourceType;

  private String sourceKey;

  private Long sourceVersion;

  private String payloadHash;

  private String state;

  private String remark;

  private LocalDateTime createTime;

  private LocalDateTime updateTime;

  private String createBy;

  private String updateBy;

  @Version private Integer version;
}
