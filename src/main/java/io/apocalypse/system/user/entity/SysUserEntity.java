package io.apocalypse.system.user.entity;

import io.apocalypse.common.entity.BaseEntity;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 系统用户（对应 {@code sys_user}）。 适度充血：状态转换内聚在实体内，非法转换抛业务异常。 */
@Getter
@Setter
@TableName("sys_user")
public class SysUserEntity extends BaseEntity {

  /** 状态：正常。 */
  public static final int STATUS_ENABLED = 1;

  /** 状态：禁用。 */
  public static final int STATUS_DISABLED = 0;

  private String username;

  private String password;

  private String nickname;

  /** 所属部门 ID（sys_dept.id）。 */
  private Long deptId;

  private Integer status;

  /** 启用。仅禁用状态可启用。 */
  public void enable() {
    if (status != null && status == STATUS_ENABLED) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "用户已处于启用状态");
    }
    this.status = STATUS_ENABLED;
  }

  /** 禁用。仅正常状态可禁用。 */
  public void disable() {
    if (status == null || status != STATUS_ENABLED) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "用户已处于禁用状态");
    }
    this.status = STATUS_DISABLED;
  }

  /** 是否可用（登录前置校验）。 */
  public boolean isEnabled() {
    return status != null && status == STATUS_ENABLED;
  }
}
