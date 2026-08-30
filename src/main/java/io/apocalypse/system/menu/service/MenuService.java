package io.apocalypse.system.menu.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.system.menu.dto.request.MenuSaveReq;
import io.apocalypse.system.menu.dto.response.MenuTreeNode;
import io.apocalypse.system.menu.entity.SysMenuEntity;
import io.apocalypse.system.menu.mapper.SysMenuMapper;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 菜单服务：菜单树构建、按用户查菜单/权限。 perms 查询走两级缓存（userPerms），菜单或角色-菜单关系变更时整体失效。 */
@Service
@RequiredArgsConstructor
public class MenuService {

  private final SysMenuMapper sysMenuMapper;

  private final TokenVersionStore tokenVersionStore;

  /** 全量菜单树（管理端）。 */
  public List<MenuTreeNode> tree() {
    return buildTree(sysMenuMapper.selectAll());
  }

  /** 当前用户可见的菜单树。 */
  public List<MenuTreeNode> treeByUserId(Long userId) {
    return buildTree(sysMenuMapper.selectByUserId(userId));
  }

  /** 用户接口权限串（缓存示例：两级缓存 userPerms）。 */
  @Cacheable(cacheNames = "userPerms", key = "#userId")
  public List<String> permsByUserId(Long userId) {
    return sysMenuMapper.selectPermsByUserId(userId);
  }

  /** 认证签发专用：始终从数据库读取，禁止把可能滞后的缓存权限写入新 JWT。 */
  public List<String> freshPermsByUserId(Long userId) {
    return sysMenuMapper.selectPermsByUserId(userId);
  }

  /** 角色授权前批量校验菜单主键。 */
  public void requireValidMenuIds(List<Long> menuIds) {
    if (!menuIds.isEmpty() && sysMenuMapper.selectBatchIds(menuIds).size() != menuIds.size()) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "存在无效的菜单");
    }
  }

  /** 新增菜单，返回主键。菜单影响权限串，清空 userPerms 缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public Long create(MenuSaveReq req) {
    validateParent(null, req.parentId());
    SysMenuEntity entity = new SysMenuEntity();
    applyReq(entity, req);
    entity.setId(null);
    sysMenuMapper.insert(entity);
    tokenVersionStore.invalidateGlobalAuthorization();
    return entity.getId();
  }

  /** 更新菜单。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public void update(Long id, MenuSaveReq req) {
    SysMenuEntity entity = requireById(id);
    validateParent(id, req.parentId());
    applyReq(entity, req);
    ConcurrencyGuard.requireSingleRow(sysMenuMapper.updateById(entity));
    tokenVersionStore.invalidateGlobalAuthorization();
  }

  /** 删除菜单（逻辑删）。存在子菜单时不允许删除。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public void delete(Long id) {
    requireById(id);
    if (!sysMenuMapper.selectByParentId(id).isEmpty()) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "存在子菜单，不允许删除");
    }
    ConcurrencyGuard.requireSingleRow(sysMenuMapper.deleteById(id));
    tokenVersionStore.invalidateGlobalAuthorization();
  }

  private SysMenuEntity requireById(Long id) {
    SysMenuEntity entity = sysMenuMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "菜单不存在");
    }
    return entity;
  }

  /** 父链必须存在、不能以按钮为父，并且不能回到当前节点或已有环。 */
  private void validateParent(Long currentId, Long parentId) {
    if (parentId == null || parentId == 0) {
      return;
    }
    Set<Long> visited = new HashSet<>();
    Long cursor = parentId;
    boolean directParent = true;
    while (cursor != null && cursor != 0) {
      if (currentId != null && currentId.equals(cursor)) {
        throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "父菜单不能是自身或其下级菜单");
      }
      if (!visited.add(cursor)) {
        throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "菜单父链存在循环");
      }
      SysMenuEntity parent = requireById(cursor);
      if (directParent && "F".equals(parent.getMenuType())) {
        throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "按钮节点不能作为父菜单");
      }
      directParent = false;
      cursor = parent.getParentId();
    }
  }

  private static void applyReq(SysMenuEntity entity, MenuSaveReq req) {
    entity.setParentId(req.parentId());
    entity.setMenuName(req.menuName());
    entity.setMenuType(req.menuType());
    entity.setPath(req.path());
    entity.setComponent(req.component());
    entity.setPerms(req.perms());
    entity.setIcon(req.icon());
    entity.setSort(req.sort() == null ? 0 : req.sort());
    entity.setVisible(req.visible() == null ? 1 : req.visible());
    entity.setStatus(req.status() == null ? 1 : req.status());
    entity.setRemark(req.remark());
  }

  /** 构建菜单树：parentId 为 0 或父节点不在集合内的视为根，子节点按 sort 排序。 */
  private static List<MenuTreeNode> buildTree(List<SysMenuEntity> menus) {
    Map<Long, List<SysMenuEntity>> childrenByParent =
        menus.stream().collect(Collectors.groupingBy(SysMenuEntity::getParentId));
    Set<Long> ids = menus.stream().map(SysMenuEntity::getId).collect(Collectors.toSet());
    return menus.stream()
        .filter(menu -> menu.getParentId() == 0 || !ids.contains(menu.getParentId()))
        .sorted(Comparator.comparing(SysMenuEntity::getSort))
        .map(menu -> toNode(menu, childrenByParent))
        .toList();
  }

  private static MenuTreeNode toNode(
      SysMenuEntity entity, Map<Long, List<SysMenuEntity>> childrenByParent) {
    List<MenuTreeNode> children =
        childrenByParent.getOrDefault(entity.getId(), List.of()).stream()
            .sorted(Comparator.comparing(SysMenuEntity::getSort))
            .map(child -> toNode(child, childrenByParent))
            .toList();
    return new MenuTreeNode(
        entity.getId(),
        entity.getParentId(),
        entity.getMenuName(),
        entity.getMenuType(),
        entity.getPath(),
        entity.getComponent(),
        entity.getPerms(),
        entity.getIcon(),
        entity.getSort(),
        entity.getRemark(),
        children,
        entity.getVisible(),
        entity.getStatus());
  }
}
