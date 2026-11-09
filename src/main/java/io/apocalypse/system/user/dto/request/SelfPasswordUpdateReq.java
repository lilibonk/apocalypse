package io.apocalypse.system.user.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 当前登录用户自助修改密码请求（必须核验原密码，并通过 PasswordPolicy 校验新密码强度）。 */
public record SelfPasswordUpdateReq(
    @NotBlank(message = "原密码不能为空") String oldPassword,
    @NotBlank(message = "新密码不能为空") @Size(max = 64, message = "密码最长 64 字符") String newPassword) {}
