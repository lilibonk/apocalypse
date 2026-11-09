package io.apocalypse.system.user.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 当前登录用户自助修改个人资料请求（仅允许修改自身展示昵称，禁止传入角色、部门或状态）。 */
public record SelfProfileUpdateReq(
    @NotBlank(message = "昵称不能为空") @Size(max = 64, message = "昵称最长 64 字符") String nickname) {}
