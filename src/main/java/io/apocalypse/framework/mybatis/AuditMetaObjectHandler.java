package io.apocalypse.framework.mybatis;

import io.apocalypse.framework.security.SecurityUtils;

import java.time.LocalDateTime;

import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;

/**
 * 审计字段自动填充：insert 填 createTime/updateTime/createBy/updateBy/version/deleted， update 填
 * updateTime/updateBy。操作人取自安全上下文，匿名场景（如系统任务）落 "system"。
 */
@Component
public class AuditMetaObjectHandler implements MetaObjectHandler {

  /** 无登录上下文时的默认操作人。 */
  private static final String DEFAULT_OPERATOR = "system";

  @Override
  public void insertFill(MetaObject metaObject) {
    LocalDateTime now = LocalDateTime.now();
    String operator = SecurityUtils.currentUsername().orElse(DEFAULT_OPERATOR);
    this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, now);
    this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, now);
    this.strictInsertFill(metaObject, "createBy", String.class, operator);
    this.strictInsertFill(metaObject, "updateBy", String.class, operator);
    this.strictInsertFill(metaObject, "version", Integer.class, 0);
    this.strictInsertFill(metaObject, "deleted", Integer.class, 0);
  }

  @Override
  public void updateFill(MetaObject metaObject) {
    String operator = SecurityUtils.currentUsername().orElse(DEFAULT_OPERATOR);
    this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
    this.strictUpdateFill(metaObject, "updateBy", String.class, operator);
  }
}
