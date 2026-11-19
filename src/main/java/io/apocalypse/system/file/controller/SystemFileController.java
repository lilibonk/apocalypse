package io.apocalypse.system.file.controller;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.ratelimit.RateLimit;
import io.apocalypse.system.file.dto.request.FileBatchDeleteReq;
import io.apocalypse.system.file.dto.response.FileQuotaSummaryResp;
import io.apocalypse.system.file.dto.response.SysFileResp;
import io.apocalypse.system.file.dto.response.UploadedFileResp;
import io.apocalypse.system.file.service.SystemFileService;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import lombok.RequiredArgsConstructor;

/** 通用文件管理端点：强制业务动作鉴权、限流、配额守卫与安全附件下载头。 */
@Validated
@RestController
@RequestMapping("/system/files")
@RequiredArgsConstructor
public class SystemFileController {

  private final SystemFileService systemFileService;

  @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize("hasAuthority('system:file:upload')")
  @RateLimit(limit = 20, windowSeconds = 60, key = "file-upload")
  @OperLog(title = "文件管理", businessType = "UPLOAD")
  public UploadedFileResp upload(
      @RequestParam("file") MultipartFile file,
      @RequestParam(defaultValue = "general") String category,
      @RequestParam(required = false) @Size(max = 255, message = "备注长度不能超过 255 字符") String remark) {
    return systemFileService.upload(category, remark, file);
  }

  @GetMapping("/page")
  @PreAuthorize("hasAuthority('system:file:list')")
  public PageResult<SysFileResp> page(
      @RequestParam(defaultValue = "1") @Min(value = 1, message = "页码必须大于 0") int page,
      @RequestParam(defaultValue = "10")
          @Min(value = 1, message = "每页条数必须大于 0")
          @Max(value = 200, message = "每页条数不能超过 200")
          int size,
      @RequestParam(required = false) String keyword,
      @RequestParam(required = false) String category,
      @RequestParam(required = false) String contentType) {
    return systemFileService.page(page, size, keyword, category, contentType);
  }

  @GetMapping("/quota")
  @PreAuthorize("hasAnyAuthority('system:file:list', 'system:file:upload')")
  public FileQuotaSummaryResp quota() {
    return systemFileService.quotaSummary();
  }

  @GetMapping("/{id}/download")
  @PreAuthorize("hasAnyAuthority('system:file:list', 'system:file:upload')")
  @ApiResponse(
      responseCode = "200",
      description = "成功返回原始附件流；业务错误返回 JSON R",
      content =
          @Content(
              mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE,
              schema = @Schema(type = "string", format = "binary")),
      headers = {
        @Header(name = "Content-Disposition", schema = @Schema(type = "string")),
        @Header(name = "Cache-Control", schema = @Schema(type = "string")),
        @Header(name = "X-Content-Type-Options", schema = @Schema(type = "string")),
        @Header(name = "Content-Security-Policy", schema = @Schema(type = "string"))
      })
  public ResponseEntity<byte[]> download(@PathVariable Long id) {
    SystemFileService.FileDownload payload = systemFileService.download(id);
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
    headers.setContentLength(payload.bytes().length);
    headers.setContentDisposition(
        ContentDisposition.attachment()
            .filename(payload.originalFilename(), StandardCharsets.UTF_8)
            .build());
    headers.setCacheControl(CacheControl.noStore());
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
    return ResponseEntity.ok().headers(headers).body(payload.bytes());
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('system:file:remove')")
  @OperLog(title = "文件管理", businessType = "DELETE")
  public void delete(@PathVariable Long id) {
    systemFileService.delete(id);
  }

  @DeleteMapping("/batch")
  @PreAuthorize("hasAuthority('system:file:remove')")
  @OperLog(title = "文件管理", businessType = "DELETE")
  public void deleteBatch(@Validated @RequestBody FileBatchDeleteReq req) {
    systemFileService.deleteBatch(req.ids());
  }
}
