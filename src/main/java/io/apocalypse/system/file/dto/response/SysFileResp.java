package io.apocalypse.system.file.dto.response;

import java.time.LocalDateTime;

/** 文件台账详情响应。 */
public record SysFileResp(
    Long id,
    String key,
    String category,
    String originalFilename,
    String contentType,
    long size,
    String sha256,
    Long ownerId,
    String ownerUsername,
    Long deptId,
    String remark,
    LocalDateTime createTime) {}
