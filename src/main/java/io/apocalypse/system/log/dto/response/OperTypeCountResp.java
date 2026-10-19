package io.apocalypse.system.log.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 操作类型计数；{@code type} 为空表示来源未记录类型，原始业务值不做改写。 */
public record OperTypeCountResp(@Schema(nullable = true) String type, long count) {}
