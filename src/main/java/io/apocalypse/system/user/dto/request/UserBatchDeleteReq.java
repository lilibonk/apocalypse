package io.apocalypse.system.user.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 批量删除用户请求。 */
public record UserBatchDeleteReq(
    @NotEmpty(message = "待删除用户ID列表不能为空") @Size(max = 200, message = "单次批量删除不能超过 200 条")
        List<Long> ids) {}
