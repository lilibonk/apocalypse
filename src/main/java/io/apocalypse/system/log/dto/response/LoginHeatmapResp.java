package io.apocalypse.system.log.dto.response;

import java.time.LocalDateTime;
import java.util.List;

/** 登录热力图：固定 168 格（7×24），{@code coveredFrom} 为窗口起点与保留期起点中较晚者。 */
public record LoginHeatmapResp(
    String range,
    String zone,
    String utcOffset,
    LocalDateTime from,
    LocalDateTime to,
    LocalDateTime coveredFrom,
    LocalDateTime retentionStart,
    long total,
    long failed,
    long maxCell,
    List<LoginHeatmapCellResp> cells) {}
