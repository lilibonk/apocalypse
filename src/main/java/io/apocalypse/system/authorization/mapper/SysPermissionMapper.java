package io.apocalypse.system.authorization.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.authorization.dto.response.PermissionReferenceCountResp;
import io.apocalypse.system.authorization.entity.SysPermissionEntity;

import java.util.List;

import org.apache.ibatis.annotations.Select;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** MP 查询仅在 mapper 内构造。 */
public interface SysPermissionMapper extends BaseMapper<SysPermissionEntity> {
  default PageResult<SysPermissionEntity> pageDefinitions(
      int page, int size, String keyword, String moduleKey, String resource, Integer status) {
    LambdaQueryWrapper<SysPermissionEntity> query = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      query.and(
          part ->
              part.like(SysPermissionEntity::getCode, keyword)
                  .or()
                  .like(SysPermissionEntity::getName, keyword));
    }
    if (moduleKey != null) {
      if (moduleKey.isEmpty()) {
        query.isNull(SysPermissionEntity::getModuleKey);
      } else {
        query.eq(SysPermissionEntity::getModuleKey, moduleKey);
      }
    }
    if (StringUtils.hasText(resource)) {
      query.eq(SysPermissionEntity::getResource, resource);
    }
    if (status != null) {
      query.eq(SysPermissionEntity::getStatus, status);
    }
    query.orderByAsc(SysPermissionEntity::getCode);
    return PageResult.of(selectPage(new Page<>(page, size), query));
  }

  @Select(
      "SELECT permission_id, count(*) AS role_count FROM sys_role_permission GROUP BY permission_id")
  List<PermissionReferenceCountResp> referenceCounts();
}
