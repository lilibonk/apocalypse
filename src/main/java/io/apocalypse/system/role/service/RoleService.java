package io.apocalypse.system.role.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.menu.mapper.SysMenuMapper;
import io.apocalypse.system.role.dto.request.RoleSaveReq;
import io.apocalypse.system.role.dto.response.RoleResp;
import io.apocalypse.system.role.dto.response.RoleUserResp;
import io.apocalypse.system.role.entity.SysRoleEntity;
import io.apocalypse.system.role.mapper.SysRoleMapper;
import io.apocalypse.system.user.mapper.SysUserMapper;
import io.apocalypse.system.user.service.UserConvert;

import java.util.List;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 角色服务：角色 CRUD、角色-菜单授权与角色-用户管理。 角色关联关系影响用户权限串，变更时清空 userPerms 缓存。 */
@Service
@RequiredArgsConstructor
public class RoleService {

  private final SysRoleMapper sysRoleMapper;

  private final SysMenuMapper sysMenuMapper;

  private final SysUserMapper sysUserMapper;

  private final RoleConvert roleConvert;

  private final UserConvert userConvert;

  /** 分页查询角色。 */
  public PageResult<RoleResp> page(int page, int size, String keyword) {
    return sysRoleMapper.pageByKeyword(page, size, keyword).map(roleConvert::toResp);
  }

  /** 新增角色，返回主键。 */
  @Transactional
  public Long create(RoleSaveReq req) {
    if (sysRoleMapper.existsByRoleKey(req.roleKey())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "角色标识已存在");
    }
    SysRoleEntity entity = new SysRoleEntity();
    applyReq(entity, req);
    sysRoleMapper.insert(entity);
    return entity.getId();
  }

  /** 更新角色。 */
  @Transactional
  public void update(Long id, RoleSaveReq req) {
    SysRoleEntity entity = requireById(id);
    if (!entity.getRoleKey().equals(req.roleKey())
        && sysRoleMapper.existsByRoleKey(req.roleKey())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "角色标识已存在");
    }
    applyReq(entity, req);
    sysRoleMapper.updateById(entity);
  }

  /** 删除角色（逻辑删，同时清空角色-菜单关联）。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public void delete(Long id) {
    requireById(id);
    sysRoleMapper.deleteMenusByRoleId(id);
    sysRoleMapper.deleteById(id);
  }

  /** 重置角色菜单（授权）。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public void assignMenus(Long roleId, List<Long> menuIds) {
    requireById(roleId);
    List<Long> ids = menuIds == null ? List.of() : menuIds;
    if (!ids.isEmpty() && sysMenuMapper.selectBatchIds(ids).size() != ids.size()) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "存在无效的菜单");
    }
    sysRoleMapper.replaceMenus(roleId, ids);
  }

  /** 查询角色当前菜单授权，用于授权修改前的安全回显。 */
  public List<Long> menuIds(Long roleId) {
    requireById(roleId);
    return sysRoleMapper.selectMenuIdsByRoleId(roleId);
  }

  /** 分页查询角色下的用户。 */
  public PageResult<RoleUserResp> pageUsers(Long roleId, int page, int size) {
    requireById(roleId);
    return sysUserMapper.pageByRoleId(roleId, page, size).map(userConvert::toRoleUserResp);
  }

  /** 整体替换角色下的用户。用户角色变化影响权限串，清空 userPerms 缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public void assignUsers(Long roleId, List<Long> userIds) {
    requireById(roleId);
    List<Long> ids = userIds == null ? List.of() : userIds;
    if (!ids.isEmpty() && sysUserMapper.selectBatchIds(ids).size() != ids.size()) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "存在无效的用户");
    }
    sysRoleMapper.deleteUsersByRoleId(roleId);
    ids.forEach(userId -> sysUserMapper.insertUserRole(userId, roleId));
  }

  private SysRoleEntity requireById(Long id) {
    SysRoleEntity entity = sysRoleMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "角色不存在");
    }
    return entity;
  }

  private static void applyReq(SysRoleEntity entity, RoleSaveReq req) {
    entity.setRoleName(req.roleName());
    entity.setRoleKey(req.roleKey());
    entity.setSort(req.sort() == null ? 0 : req.sort());
    entity.setStatus(req.status() == null ? SysRoleEntity.STATUS_ENABLED : req.status());
    entity.setRemark(req.remark());
  }
}
