package io.apocalypse.system.role.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.role.entity.SysRoleEntity;

import java.util.List;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 角色 Mapper。MP 类型封装在 default 方法内（约定见 {@link SysUserMapper}）。 */
public interface SysRoleMapper extends BaseMapper<SysRoleEntity> {

  /** 按角色名/角色标识关键字分页。 */
  default PageResult<SysRoleEntity> pageByKeyword(int page, int size, String keyword) {
    LambdaQueryWrapper<SysRoleEntity> wrapper = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      wrapper
          .like(SysRoleEntity::getRoleName, keyword)
          .or()
          .like(SysRoleEntity::getRoleKey, keyword);
    }
    wrapper.orderByAsc(SysRoleEntity::getSort);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }

  /** 角色标识是否已存在。 */
  default boolean existsByRoleKey(@Param("roleKey") String roleKey) {
    return selectCount(
            new LambdaQueryWrapper<SysRoleEntity>().eq(SysRoleEntity::getRoleKey, roleKey))
        > 0;
  }

  /** 联表查询用户拥有的有效角色（自定义 SQL 不走路由逻辑删除，需显式带 deleted 条件）。 */
  @Select(
      """
      SELECT r.* FROM sys_role r
      JOIN sys_user_role ur ON r.id = ur.role_id
      WHERE ur.user_id = #{userId} AND r.deleted = 0 AND r.status = 1
      ORDER BY r.sort
      """)
  List<SysRoleEntity> selectByUserId(@Param("userId") Long userId);

  /** 查询角色当前关联的菜单主键。 */
  @Select("SELECT menu_id FROM sys_role_menu WHERE role_id = #{roleId} ORDER BY menu_id")
  List<Long> selectMenuIdsByRoleId(@Param("roleId") Long roleId);

  /** 写入角色-菜单关联。 */
  @Insert("INSERT INTO sys_role_menu (role_id, menu_id) VALUES (#{roleId}, #{menuId})")
  int insertRoleMenu(@Param("roleId") Long roleId, @Param("menuId") Long menuId);

  /** 清空角色的全部菜单关联。 */
  @Delete("DELETE FROM sys_role_menu WHERE role_id = #{roleId}")
  int deleteMenusByRoleId(@Param("roleId") Long roleId);

  /** 重置角色菜单：先清空再批量写入。 */
  default void replaceMenus(Long roleId, List<Long> menuIds) {
    deleteMenusByRoleId(roleId);
    menuIds.forEach(menuId -> insertRoleMenu(roleId, menuId));
  }

  /** 清空角色下的全部用户关联（角色-用户整体替换前调用）。 */
  @Delete("DELETE FROM sys_user_role WHERE role_id = #{roleId}")
  int deleteUsersByRoleId(@Param("roleId") Long roleId);
}
