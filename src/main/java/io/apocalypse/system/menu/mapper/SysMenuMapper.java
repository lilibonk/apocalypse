package io.apocalypse.system.menu.mapper;

import io.apocalypse.system.menu.entity.SysMenuEntity;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

/** 菜单 Mapper。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysMenuMapper extends BaseMapper<SysMenuEntity> {

  /** 全量菜单（按显示顺序）。 */
  default List<SysMenuEntity> selectAll() {
    return selectList(new LambdaQueryWrapper<SysMenuEntity>().orderByAsc(SysMenuEntity::getSort));
  }

  /** 某节点的直接子节点。 */
  default List<SysMenuEntity> selectByParentId(@Param("parentId") Long parentId) {
    return selectList(
        new LambdaQueryWrapper<SysMenuEntity>().eq(SysMenuEntity::getParentId, parentId));
  }

  /** 联表查询用户可见的有效菜单（经用户-角色-菜单两级关联）。 */
  @Select(
      """
      SELECT DISTINCT m.* FROM sys_menu m
      JOIN sys_role_menu rm ON m.id = rm.menu_id
      JOIN sys_role r ON rm.role_id = r.id
      JOIN sys_user_role ur ON rm.role_id = ur.role_id
      WHERE ur.user_id = #{userId}
        AND r.deleted = 0 AND r.status = 1
        AND m.deleted = 0 AND m.status = 1 AND m.visible = 1
      ORDER BY m.sort
      """)
  List<SysMenuEntity> selectByUserId(@Param("userId") Long userId);

  /** 联表查询用户的接口权限菜单；MenuService 再按同一 capability registry 过滤。 */
  @Select(
      """
      SELECT DISTINCT m.* FROM sys_menu m
      JOIN sys_role_menu rm ON m.id = rm.menu_id
      JOIN sys_role r ON rm.role_id = r.id
      JOIN sys_user_role ur ON rm.role_id = ur.role_id
      WHERE ur.user_id = #{userId}
        AND r.deleted = 0 AND r.status = 1
        AND m.deleted = 0 AND m.status = 1
        AND m.perms IS NOT NULL AND m.perms <> ''
      """)
  List<SysMenuEntity> selectPermissionMenusByUserId(@Param("userId") Long userId);
}
