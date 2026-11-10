package io.apocalypse.system.file.controller;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.system.file.dto.response.UploadedFileResp;
import io.apocalypse.system.file.service.SystemFileService;

import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

/** 通用文件上传端点（FE-W6 / M2）：对接 {@code FileStoragePort}，仅允许有效用户会话调用。 */
@RestController
@RequestMapping("/system/files")
@RequiredArgsConstructor
public class SystemFileController {

  private final SystemFileService systemFileService;

  @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @OperLog(title = "文件管理", businessType = "UPLOAD")
  public UploadedFileResp upload(
      @RequestParam("file") MultipartFile file,
      @RequestParam(defaultValue = "general") String category) {
    SecurityUtils.currentUserId().orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
    LiveAuthorizationService.requireUserToken(
        SecurityContextHolder.getContext().getAuthentication());
    return systemFileService.upload(category, file);
  }
}
