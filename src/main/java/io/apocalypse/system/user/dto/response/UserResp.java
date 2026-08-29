package io.apocalypse.system.user.dto.response;

import java.time.LocalDateTime;

/** 用户响应（deptName 由 Service 装配，非实体字段）。 */
public record UserResp(
    Long id,
    String username,
    String nickname,
    Integer status,
    Long deptId,
    String deptName,
    LocalDateTime createTime) {}
