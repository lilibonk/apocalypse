package io.apocalypse.system.file.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.framework.storage.FileStoragePort;
import io.apocalypse.framework.storage.StorageProperties;
import io.apocalypse.framework.storage.StoredFile;
import io.apocalypse.system.authorization.dto.response.DataScopeResp;
import io.apocalypse.system.authorization.service.DataScopeService;
import io.apocalypse.system.file.dto.response.FileQuotaSummaryResp;
import io.apocalypse.system.file.dto.response.SysFileResp;
import io.apocalypse.system.file.dto.response.UploadedFileResp;
import io.apocalypse.system.file.entity.SysFile;
import io.apocalypse.system.file.mapper.SysFileMapper;
import io.apocalypse.system.user.service.UserService;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 通用文件台账与存储编排服务：
 *
 * <ul>
 *   <li>委托 {@link FileStoragePort} 执行魔数/结构校验、大小上限与防路径穿越存储；
 *   <li>事务内通过 PostgreSQL advisory lock 核算全局与单人存储配额，回滚时自动清理磁盘孤儿文件；
 *   <li>下载与删除强制校验上传者归属或部门数据范围，并保护全局 {@code ALL} 角色账号上传文件。
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SystemFileService {

  private final FileStoragePort fileStoragePort;

  private final StorageProperties storageProperties;

  private final SysFileMapper sysFileMapper;

  private final DataScopeService dataScopeService;

  private final UserService userService;

  /** 受控下载二进制载荷。 */
  public record FileDownload(String originalFilename, String contentType, byte[] bytes) {}

  public UploadedFileResp upload(String category, MultipartFile file) {
    return upload(category, null, file);
  }

  @Transactional
  public UploadedFileResp upload(String category, String remark, MultipartFile file) {
    Jwt jwt = requireCurrentUserJwt();
    Long currentUserId = ((Number) jwt.getClaim("uid")).longValue();
    String currentUsername = jwt.getSubject();
    if (file == null || file.isEmpty()) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "上传文件内容不能为空");
    }
    if (file.getSize() > storageProperties.getMaxFileSizeBytes()) {
      throw new BizException(
          ErrorCode.PARAM_INVALID.getCode(),
          "上传文件大小超过上限（最大 " + storageProperties.getMaxFileSizeBytes() + " 字节）");
    }
    String normalizedRemark = StringUtils.hasText(remark) ? remark.trim() : null;
    if (normalizedRemark != null && normalizedRemark.length() > 255) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "备注长度不能超过 255 字符");
    }

    byte[] bytes;
    try {
      bytes = file.getBytes();
    } catch (IOException ex) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "读取上传文件失败");
    }
    if (bytes.length == 0) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "上传文件内容不能为空");
    }
    if (bytes.length > storageProperties.getMaxFileSizeBytes()) {
      throw new BizException(
          ErrorCode.PARAM_INVALID.getCode(),
          "上传文件大小超过上限（最大 " + storageProperties.getMaxFileSizeBytes() + " 字节）");
    }

    Long deptId = userService.findActiveDeptId(currentUserId);
    String targetCategory = StringUtils.hasText(category) ? category.trim() : "general";

    sysFileMapper.acquireQuotaLock();
    long usedTotal = sysFileMapper.sumActiveBytes();
    long usedByUser = sysFileMapper.sumActiveBytesByOwner(currentUserId);
    if (exceedsQuota(usedTotal, bytes.length, storageProperties.getTotalQuotaBytes())
        || exceedsQuota(usedByUser, bytes.length, storageProperties.getUserQuotaBytes())) {
      throw new BizException(ErrorCode.CONFLICT.getCode(), "文件存储配额不足");
    }

    StoredFile stored =
        fileStoragePort.store(
            targetCategory, file.getOriginalFilename(), file.getContentType(), bytes);
    registerRollbackCleanup(stored.storageKey());

    SysFile entity = new SysFile();
    entity.setStorageKey(stored.storageKey());
    entity.setCategory(targetCategory);
    entity.setOriginalFilename(stored.originalFilename());
    entity.setContentType(stored.contentType());
    entity.setSizeBytes(stored.sizeBytes());
    entity.setSha256(stored.sha256Hex());
    entity.setOwnerId(currentUserId);
    entity.setOwnerUsername(currentUsername);
    entity.setDeptId(deptId);
    entity.setRemark(normalizedRemark);

    try {
      sysFileMapper.insert(entity);
    } catch (RuntimeException ex) {
      if (!TransactionSynchronizationManager.isSynchronizationActive()) {
        safeDeleteStoredFile(stored.storageKey());
      }
      throw ex;
    }

    return new UploadedFileResp(
        entity.getId(),
        stored.storageKey(),
        stored.originalFilename(),
        stored.contentType(),
        stored.sizeBytes());
  }

  public PageResult<SysFileResp> page(
      int page, int size, String keyword, String category, String contentType) {
    Long currentUserId = requireCurrentUserId();
    DataScopeResp scope = dataScopeService.resolve("system:file:list");
    return sysFileMapper
        .selectScopedPage(
            page,
            size,
            normalizeFilter(keyword),
            normalizeFilter(category),
            normalizeFilter(contentType),
            scope,
            currentUserId)
        .map(SystemFileService::toResp);
  }

  public FileQuotaSummaryResp quotaSummary() {
    Long currentUserId = requireCurrentUserId();
    long usedByUser = sysFileMapper.sumActiveBytesByOwner(currentUserId);
    boolean canList = SecurityUtils.hasAuthority("system:file:list");
    long usedTotal = canList ? sysFileMapper.sumActiveBytes() : 0L;
    long activeFiles = canList ? sysFileMapper.countActiveFiles() : 0L;
    return new FileQuotaSummaryResp(
        usedByUser,
        storageProperties.getUserQuotaBytes(),
        usedTotal,
        storageProperties.getTotalQuotaBytes(),
        storageProperties.getMaxFileSizeBytes(),
        activeFiles);
  }

  public FileDownload download(Long id) {
    Long currentUserId = requireCurrentUserId();
    SysFile entity = sysFileMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "文件不存在");
    }
    if (!entity.getOwnerId().equals(currentUserId)) {
      if (!SecurityUtils.hasAuthority("system:file:list")) {
        throw new BizException(ErrorCode.NOT_FOUND.getCode(), "文件不存在");
      }
      DataScopeResp scope = dataScopeService.resolve("system:file:list");
      if (!scope.permits(entity.getDeptId())) {
        throw new BizException(ErrorCode.NOT_FOUND.getCode(), "文件不存在");
      }
    }
    byte[] bytes = fileStoragePort.read(entity.getStorageKey());
    return new FileDownload(entity.getOriginalFilename(), entity.getContentType(), bytes);
  }

  @Transactional
  public void delete(Long id) {
    deleteBatch(List.of(id));
  }

  @Transactional
  public void deleteBatch(List<Long> ids) {
    if (ids == null || ids.isEmpty()) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "待删除文件 ID 列表不能为空");
    }
    for (Long id : ids) {
      if (id == null) {
        throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "文件 ID 不能为空");
      }
    }
    Long currentUserId = requireCurrentUserId();
    dataScopeService.lockForWrite();
    DataScopeResp scope = dataScopeService.resolve("system:file:remove");

    List<Long> uniqueIds = ids.stream().distinct().toList();
    List<String> keysToDelete = new ArrayList<>(uniqueIds.size());
    for (Long id : uniqueIds) {
      SysFile entity = sysFileMapper.selectById(id);
      if (entity == null) {
        throw new BizException(ErrorCode.NOT_FOUND.getCode(), "文件不存在");
      }
      if (!entity.getOwnerId().equals(currentUserId)) {
        requireWritableFileOwner(scope, entity);
      }
      ConcurrencyGuard.requireSingleRow(sysFileMapper.deleteById(entity.getId()));
      keysToDelete.add(entity.getStorageKey());
    }
    registerAfterCommitCleanup(keysToDelete);
  }

  private void requireWritableFileOwner(DataScopeResp scope, SysFile entity) {
    try {
      dataScopeService.requireWritableTarget(scope, entity.getOwnerId(), entity.getDeptId());
    } catch (BizException ex) {
      if (ex.getCode() == ErrorCode.NOT_FOUND.getCode()) {
        throw new BizException(ErrorCode.NOT_FOUND.getCode(), "文件不存在");
      }
      throw ex;
    }
  }

  private void registerRollbackCleanup(String storageKey) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCompletion(int status) {
            if (status != STATUS_COMMITTED) {
              safeDeleteStoredFile(storageKey);
            }
          }
        });
  }

  private void registerAfterCommitCleanup(List<String> storageKeys) {
    if (storageKeys.isEmpty()) {
      return;
    }
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      storageKeys.forEach(this::safeDeleteStoredFile);
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            storageKeys.forEach(SystemFileService.this::safeDeleteStoredFile);
          }
        });
  }

  private void safeDeleteStoredFile(String storageKey) {
    try {
      fileStoragePort.delete(storageKey);
    } catch (RuntimeException ex) {
      log.warn("物理回收存储文件失败，storageKey={}: {}", storageKey, ex.getMessage());
    }
  }

  private static boolean exceedsQuota(long usedBytes, long incomingBytes, long limitBytes) {
    return usedBytes < 0 || limitBytes <= 0 || incomingBytes > limitBytes - usedBytes;
  }

  private static String normalizeFilter(String raw) {
    return StringUtils.hasText(raw) ? raw.trim() : null;
  }

  private static Long requireCurrentUserId() {
    Jwt jwt = requireCurrentUserJwt();
    return ((Number) jwt.getClaim("uid")).longValue();
  }

  private static Jwt requireCurrentUserJwt() {
    SecurityUtils.currentUserId().orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
    return LiveAuthorizationService.requireUserToken(
        SecurityContextHolder.getContext().getAuthentication());
  }

  private static SysFileResp toResp(SysFile entity) {
    return new SysFileResp(
        entity.getId(),
        entity.getStorageKey(),
        entity.getCategory(),
        entity.getOriginalFilename(),
        entity.getContentType(),
        entity.getSizeBytes() == null ? 0L : entity.getSizeBytes(),
        entity.getSha256(),
        entity.getOwnerId(),
        entity.getOwnerUsername(),
        entity.getDeptId(),
        entity.getRemark(),
        entity.getCreateTime());
  }
}
