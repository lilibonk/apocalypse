package io.apocalypse.system.authorization.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 分组计数；{@code key} 为数据范围或模块标识，空模块表示核心。 */
public record InsightCountResp(@Schema(nullable = true) String key, long count, boolean enabled) {}
