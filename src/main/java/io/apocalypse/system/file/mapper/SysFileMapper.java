package io.apocalypse.system.file.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.authorization.dto.response.DataScopeResp;
import io.apocalypse.system.file.entity.SysFile;

import java.util.Locale;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 通用文件台账 Mapper（MP 类型严格封装在 default 方法内）。 */
public interface SysFileMapper extends BaseMapper<SysFile> {

  @Select("SELECT 1 FROM (SELECT pg_advisory_xact_lock(4708218952193)) locked")
  Integer acquireQuotaLock();

  @Select("SELECT COALESCE(SUM(size_bytes), 0) FROM sys_file WHERE deleted = 0")
  long sumActiveBytes();

  @Select(
      "SELECT COALESCE(SUM(size_bytes), 0) FROM sys_file WHERE deleted = 0 AND owner_id = #{ownerId}")
  long sumActiveBytesByOwner(@Param("ownerId") Long ownerId);

  @Select("SELECT COUNT(*) FROM sys_file WHERE deleted = 0")
  long countActiveFiles();

  default PageResult<SysFile> selectScopedPage(
      int page,
      int size,
      String keyword,
      String category,
      String contentType,
      DataScopeResp scope,
      Long currentUserId) {
    LambdaQueryWrapper<SysFile> wrapper = new LambdaQueryWrapper<>();
    if (!scope.all()) {
      wrapper.and(
          scoped -> {
            scoped.eq(SysFile::getOwnerId, currentUserId);
            if (!scope.departmentIds().isEmpty()) {
              scoped.or(
                  dept ->
                      dept.isNotNull(SysFile::getDeptId)
                          .in(SysFile::getDeptId, scope.departmentIds()));
            }
          });
    }
    if (StringUtils.hasText(keyword)) {
      String term = keyword.trim();
      wrapper.and(
          filter ->
              filter
                  .like(SysFile::getOriginalFilename, term)
                  .or()
                  .like(SysFile::getOwnerUsername, term)
                  .or()
                  .like(SysFile::getStorageKey, term));
    }
    if (StringUtils.hasText(category)) {
      wrapper.eq(SysFile::getCategory, category.trim());
    }
    if (StringUtils.hasText(contentType)) {
      String normalized = contentType.trim().toLowerCase(Locale.ROOT);
      if (normalized.endsWith("/")) {
        wrapper.likeRight(SysFile::getContentType, normalized);
      } else if (normalized.endsWith("/*")) {
        wrapper.likeRight(
            SysFile::getContentType, normalized.substring(0, normalized.length() - 1));
      } else {
        wrapper.eq(SysFile::getContentType, normalized);
      }
    }
    wrapper.orderByDesc(SysFile::getCreateTime, SysFile::getId);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }
}
