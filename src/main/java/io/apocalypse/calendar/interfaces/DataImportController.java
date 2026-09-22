package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.application.DataImportService;
import io.apocalypse.calendar.application.ImportDownload;
import io.apocalypse.calendar.application.ImportUploadFile;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.interfaces.dto.request.DataImportCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportPublishReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportRejectReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportReviewReq;
import io.apocalypse.calendar.interfaces.dto.response.DataImportResp;
import io.apocalypse.calendar.interfaces.dto.response.ImportDiffResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.ratelimit.RateLimit;
import io.apocalypse.framework.security.SecurityUtils;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import lombok.RequiredArgsConstructor;

@Validated
@RestController
@RequestMapping("/calendar/data-imports")
@RequiredArgsConstructor
public class DataImportController {

  private final DataImportService dataImportService;

  @GetMapping("/template")
  @ApiResponse(
      responseCode = "200",
      description = "成功返回原始CSV附件；业务错误返回JSON R",
      content =
          @Content(mediaType = "text/csv", schema = @Schema(type = "string", format = "binary")),
      headers = {
        @Header(name = "Content-Disposition", schema = @Schema(type = "string")),
        @Header(name = "Cache-Control", schema = @Schema(type = "string"))
      })
  @PreAuthorize("hasAuthority('calendar:data-import:list')")
  public ResponseEntity<byte[]> template(
      @RequestParam DataImportTarget targetType, @RequestParam @Min(1901) @Max(2100) int year) {
    byte[] bytes = dataImportService.template(targetType, year);
    return downloadResponse(
        "calendar-" + targetType.name().toLowerCase(java.util.Locale.ROOT) + "-" + year + ".csv",
        MediaType.parseMediaType("text/csv;charset=UTF-8"),
        bytes);
  }

  @GetMapping("/page")
  @PreAuthorize("hasAuthority('calendar:data-import:list')")
  public PageResult<DataImportResp> page(
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "10") @Min(1) @Max(200) int size) {
    return dataImportService.page(page, size, currentUserId());
  }

  @GetMapping("/{id}")
  @PreAuthorize("hasAuthority('calendar:data-import:list')")
  public DataImportResp detail(@PathVariable Long id) {
    return dataImportService.detail(id, currentUserId());
  }

  @GetMapping("/{id}/diff")
  @PreAuthorize("hasAuthority('calendar:data-import:list')")
  public ImportDiffResp diff(@PathVariable Long id) {
    return dataImportService.diff(id, currentUserId());
  }

  @GetMapping("/{id}/files/data")
  @ApiResponse(
      responseCode = "200",
      description = "成功返回原始文件附件；业务错误返回JSON R",
      content =
          @Content(
              mediaType = "application/octet-stream",
              schema = @Schema(type = "string", format = "binary")),
      headers = {
        @Header(name = "Content-Disposition", schema = @Schema(type = "string")),
        @Header(name = "Cache-Control", schema = @Schema(type = "string"))
      })
  @PreAuthorize("hasAuthority('calendar:data-import:list')")
  public ResponseEntity<byte[]> dataFile(@PathVariable Long id) {
    return downloadResponse(dataImportService.dataFile(id, currentUserId()));
  }

  @GetMapping("/{id}/files/evidence")
  @ApiResponse(
      responseCode = "200",
      description = "成功返回原始证据附件；业务错误返回JSON R",
      content =
          @Content(
              mediaType = "application/octet-stream",
              schema = @Schema(type = "string", format = "binary")),
      headers = {
        @Header(name = "Content-Disposition", schema = @Schema(type = "string")),
        @Header(name = "Cache-Control", schema = @Schema(type = "string"))
      })
  @PreAuthorize("hasAuthority('calendar:data-import:list')")
  public ResponseEntity<byte[]> evidenceFile(@PathVariable Long id) {
    return downloadResponse(dataImportService.evidenceFile(id, currentUserId()));
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize("hasAuthority('calendar:data-import:upload')")
  @RateLimit(limit = 6, windowSeconds = 60, key = "calendar-data-import-upload")
  @OperLog(
      title = "日历数据导入",
      businessType = "UPLOAD",
      fields = {
        "/id",
        "/calendarId",
        "/eventId",
        "/revisionId",
        "/conflictId",
        "/date",
        "/version",
        "/revisionNo",
        "/revisionVersion",
        "/revisionState",
        "/state",
        "/request/expectedRevisionNo",
        "/request/expectedDraftVersion",
        "/request/expectedVersion",
        "/request/resolution",
        "/metadata/calendarId",
        "/metadata/year",
        "/metadata/targetType"
      })
  public DataImportResp upload(
      @RequestPart("metadata") @Valid DataImportCreateReq metadata,
      @RequestPart("dataFile") MultipartFile dataFile,
      @RequestPart(value = "evidenceFile", required = false) MultipartFile evidenceFile) {
    try {
      return dataImportService.upload(
          metadata,
          uploadFile(dataFile),
          evidenceFile == null ? null : uploadFile(evidenceFile),
          currentUserId(),
          currentUsername());
    } catch (IOException e) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_IMPORT_FORMAT_INVALID;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  @PostMapping("/{id}/validate")
  @PreAuthorize("hasAuthority('calendar:data-import:upload')")
  @OperLog(
      title = "日历数据导入",
      businessType = "VALIDATE",
      fields = {
        "/id",
        "/calendarId",
        "/eventId",
        "/revisionId",
        "/conflictId",
        "/date",
        "/version",
        "/revisionNo",
        "/revisionVersion",
        "/revisionState",
        "/state",
        "/request/expectedRevisionNo",
        "/request/expectedDraftVersion",
        "/request/expectedVersion",
        "/request/resolution",
        "/metadata/calendarId",
        "/metadata/year",
        "/metadata/targetType"
      })
  public DataImportResp validate(@PathVariable Long id) {
    return dataImportService.validate(id, currentUserId(), currentUsername());
  }

  @PostMapping("/{id}/review")
  @PreAuthorize("hasAuthority('calendar:data-import:publish')")
  @OperLog(
      title = "日历数据导入",
      businessType = "REVIEW",
      fields = {
        "/id",
        "/calendarId",
        "/eventId",
        "/revisionId",
        "/conflictId",
        "/date",
        "/version",
        "/revisionNo",
        "/revisionVersion",
        "/revisionState",
        "/state",
        "/request/expectedRevisionNo",
        "/request/expectedDraftVersion",
        "/request/expectedVersion",
        "/request/resolution",
        "/metadata/calendarId",
        "/metadata/year",
        "/metadata/targetType"
      })
  public DataImportResp review(
      @PathVariable Long id,
      @org.springframework.web.bind.annotation.RequestBody @Valid DataImportReviewReq request) {
    return dataImportService.review(id, request, currentUserId(), currentUsername());
  }

  @PostMapping("/{id}/publish")
  @PreAuthorize("hasAuthority('calendar:data-import:publish')")
  @OperLog(
      title = "日历数据导入",
      businessType = "PUBLISH",
      fields = {
        "/id",
        "/calendarId",
        "/eventId",
        "/revisionId",
        "/conflictId",
        "/date",
        "/version",
        "/revisionNo",
        "/revisionVersion",
        "/revisionState",
        "/state",
        "/request/expectedRevisionNo",
        "/request/expectedDraftVersion",
        "/request/expectedVersion",
        "/request/resolution",
        "/metadata/calendarId",
        "/metadata/year",
        "/metadata/targetType"
      })
  public DataImportResp publish(
      @PathVariable Long id,
      @org.springframework.web.bind.annotation.RequestBody @Valid DataImportPublishReq request) {
    return dataImportService.publish(id, request, currentUserId(), currentUsername());
  }

  @PostMapping("/{id}/reject")
  @PreAuthorize("hasAuthority('calendar:data-import:publish')")
  @OperLog(
      title = "日历数据导入",
      businessType = "REJECT",
      fields = {
        "/id",
        "/calendarId",
        "/eventId",
        "/revisionId",
        "/conflictId",
        "/date",
        "/version",
        "/revisionNo",
        "/revisionVersion",
        "/revisionState",
        "/state",
        "/request/expectedRevisionNo",
        "/request/expectedDraftVersion",
        "/request/expectedVersion",
        "/request/resolution",
        "/metadata/calendarId",
        "/metadata/year",
        "/metadata/targetType"
      })
  public DataImportResp reject(
      @PathVariable Long id,
      @org.springframework.web.bind.annotation.RequestBody @Valid DataImportRejectReq request) {
    return dataImportService.reject(id, request, currentUserId(), currentUsername());
  }

  private static ImportUploadFile uploadFile(MultipartFile value) throws IOException {
    return new ImportUploadFile(
        value.getOriginalFilename(), value.getContentType(), value.getBytes());
  }

  private static ResponseEntity<byte[]> downloadResponse(ImportDownload value) {
    return downloadResponse(value.fileName(), MediaType.APPLICATION_OCTET_STREAM, value.bytes());
  }

  private static ResponseEntity<byte[]> downloadResponse(
      String fileName, MediaType contentType, byte[] bytes) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(contentType);
    headers.setContentLength(bytes.length);
    headers.setContentDisposition(
        ContentDisposition.attachment().filename(fileName, StandardCharsets.UTF_8).build());
    headers.setCacheControl(CacheControl.noStore());
    headers.set("X-Content-Type-Options", "nosniff");
    return ResponseEntity.ok().headers(headers).body(bytes);
  }

  private static Long currentUserId() {
    return SecurityUtils.currentUserId()
        .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
  }

  private static String currentUsername() {
    return SecurityUtils.currentUsername()
        .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
  }
}
