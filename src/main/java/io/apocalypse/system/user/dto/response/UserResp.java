package io.apocalypse.system.user.dto.response;

import io.apocalypse.system.dept.dto.response.DeptPathNodeResp;
import io.apocalypse.system.role.dto.response.UserRoleSummaryResp;

import java.time.LocalDateTime;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** 用户响应（deptName / deptPath / roles 由 Service 装配，非实体字段）。 */
public record UserResp(
    Long id,
    String username,
    @Schema(nullable = true) String nickname,
    Integer status,
    @Schema(nullable = true) Long deptId,
    @Schema(nullable = true) String deptName,
    List<DeptPathNodeResp> deptPath,
    List<UserRoleSummaryResp> roles,
    LocalDateTime createTime) {

  public UserResp {
    deptPath = deptPath == null ? List.of() : List.copyOf(deptPath);
    roles = roles == null ? List.of() : List.copyOf(roles);
  }
}
