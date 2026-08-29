package io.apocalypse.system.user.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 用户创建请求。 */
public record UserCreateReq(
    @NotBlank(message = "用户名不能为空") @Size(max = 64, message = "用户名最长 64 字符") String username,
    @NotBlank(message = "密码不能为空") @Size(min = 8, max = 64, message = "密码长度须为 8-64 字符")
        String password,
    @Size(max = 64, message = "昵称最长 64 字符") String nickname,
    Long deptId) {}
