package io.apocalypse.system.user.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 重置密码请求（强度由 PasswordPolicy 校验，此处只做基础非空/长度约束）。 */
public record ResetPasswordReq(
    @NotBlank(message = "新密码不能为空") @Size(max = 64, message = "密码最长 64 字符") String newPassword) {}
