package io.apocalypse.system.user.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.user.entity.SysUserEntity;

import java.util.List;
import java.util.Optional;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/**
 * 用户 Mapper。约定（AGENTS.md）：QueryWrapper/Page 只允许出现在本包，分页等 MP 用法封装在 default 方法内并直接返回 {@link
 * PageResult} 或业务类型，Service 不接触 MP 类型。
 */
public interface SysUserMapper extends BaseMapper<SysUserEntity> {

  /** 按用户名/昵称关键字分页。 */
  default PageResult<SysUserEntity> pageByKeyword(int page, int size, String keyword) {
    LambdaQueryWrapper<SysUserEntity> wrapper = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(keyword)) {
      wrapper
          .like(SysUserEntity::getUsername, keyword)
          .or()
          .like(SysUserEntity::getNickname, keyword);
    }
    wrapper.orderByDesc(SysUserEntity::getCreateTime);
    return PageResult.of(selectPage(new Page<>(page, size), wrapper));
  }

  /** 按登录名查询（逻辑删除自动过滤）。 */
  default Optional<SysUserEntity> findByUsername(@Param("username") String username) {
    return Optional.ofNullable(
        selectOne(
            new LambdaQueryWrapper<SysUserEntity>().eq(SysUserEntity::getUsername, username)));
  }

  /** 登录名是否已存在。 */
  default boolean existsByUsername(@Param("username") String username) {
    return selectCount(
            new LambdaQueryWrapper<SysUserEntity>().eq(SysUserEntity::getUsername, username))
        > 0;
  }

  /** 写入用户-角色关联。 */
  @Insert("INSERT INTO sys_user_role (user_id, role_id) VALUES (#{userId}, #{roleId})")
  int insertUserRole(@Param("userId") Long userId, @Param("roleId") Long roleId);

  /** 清空用户的全部角色关联。 */
  @Delete("DELETE FROM sys_user_role WHERE user_id = #{userId}")
  int deleteRolesByUserId(@Param("userId") Long userId);

  /** 重置用户角色：先清空再批量写入。 */
  default void replaceRoles(Long userId, List<Long> roleIds) {
    deleteRolesByUserId(userId);
    roleIds.forEach(roleId -> insertUserRole(userId, roleId));
  }

  /** 联表分页查询某角色下的用户（角色-用户管理）。 */
  @Select(
      """
      SELECT u.* FROM sys_user u
      JOIN sys_user_role ur ON u.id = ur.user_id
      WHERE ur.role_id = #{roleId} AND u.deleted = 0
      ORDER BY u.create_time DESC
      """)
  Page<SysUserEntity> selectPageByRoleId(Page<SysUserEntity> page, @Param("roleId") Long roleId);

  /** 分页查询某角色下的用户。 */
  default PageResult<SysUserEntity> pageByRoleId(Long roleId, int page, int size) {
    return PageResult.of(selectPageByRoleId(new Page<>(page, size), roleId));
  }

  /** 挂接某部门的有效用户数（部门删除前校验）。 */
  default long countByDeptId(@Param("deptId") Long deptId) {
    return selectCount(
        new LambdaQueryWrapper<SysUserEntity>().eq(SysUserEntity::getDeptId, deptId));
  }
}
