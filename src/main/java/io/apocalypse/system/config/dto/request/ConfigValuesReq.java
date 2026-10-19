package io.apocalypse.system.config.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 参数值批量保存：同一事务内全部成功或全部失败；任一项版本过期即整体返回 40900。 */
public record ConfigValuesReq(
    @NotEmpty(message = "至少修改一项参数") @Size(max = 200, message = "一次最多保存 200 项参数")
        List<@Valid ConfigValueItemReq> items) {}
