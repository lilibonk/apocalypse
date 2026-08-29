package io.apocalypse.system.menu.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.system.menu.dto.request.MenuSaveReq;
import io.apocalypse.system.menu.dto.response.MenuTreeNode;
import io.apocalypse.system.menu.entity.SysMenuEntity;
import io.apocalypse.system.menu.mapper.SysMenuMapper;

import java.util.Comparator;
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

  /** 新增菜单，返回主键。菜单影响权限串，清空 userPerms 缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public Long create(MenuSaveReq req) {
    SysMenuEntity entity = new SysMenuEntity();
    applyReq(entity, req);
    entity.setId(null);
    sysMenuMapper.insert(entity);
    return entity.getId();
  }

  /** 更新菜单。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public void update(Long id, MenuSaveReq req) {
    SysMenuEntity entity = requireById(id);
    applyReq(entity, req);
    sysMenuMapper.updateById(entity);
  }

  /** 删除菜单（逻辑删）。存在子菜单时不允许删除。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", allEntries = true)
  public void delete(Long id) {
    requireById(id);
    if (!sysMenuMapper.selectByParentId(id).isEmpty()) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "存在子菜单，不允许删除");
    }
    sysMenuMapper.deleteById(id);
  }

  private SysMenuEntity requireById(Long id) {
    SysMenuEntity entity = sysMenuMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "菜单不存在");
    }
    return entity;
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
