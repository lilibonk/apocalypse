package io.apocalypse.system.file.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.storage.FileStoragePort;
import io.apocalypse.framework.storage.StoredFile;
import io.apocalypse.system.file.dto.response.UploadedFileResp;

import java.io.IOException;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

/** 通用文件上传服务：统一委托 {@link FileStoragePort} 执行 MIME 白名单、大小上限与防路径穿越存储。 */
@Service
@RequiredArgsConstructor
public class SystemFileService {

  private final FileStoragePort fileStoragePort;

  public UploadedFileResp upload(String category, MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "上传文件内容不能为空");
    }
    byte[] bytes;
    try {
      bytes = file.getBytes();
    } catch (IOException ex) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "读取上传文件失败");
    }
    String targetCategory = category == null || category.isBlank() ? "general" : category.trim();
    StoredFile stored =
        fileStoragePort.store(
            targetCategory, file.getOriginalFilename(), file.getContentType(), bytes);
    return new UploadedFileResp(
        stored.storageKey(), stored.originalFilename(), stored.contentType(), stored.sizeBytes());
  }
}
