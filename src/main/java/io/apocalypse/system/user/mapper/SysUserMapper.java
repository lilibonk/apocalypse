package io.apocalypse.system.user.mapper;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.user.entity.SysUserEntity;

import java.util.List;
import java.util.Optional;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;
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

  /** 仅当账号仍处于 bootstrap 哨兵状态时原子启用；并发启动只有一个调用方返回 1。 */
  @Update(
      """
      UPDATE sys_user
      SET password = #{encodedPassword}, status = 1, update_time = now(),
          update_by = 'bootstrap', version = version + 1
      WHERE username = #{username} AND deleted = 0 AND status = 0
        AND password = '{bootstrap-disabled}'
      """)
  int enableBootstrapAdmin(
      @Param("username") String username, @Param("encodedPassword") String encodedPassword);

  /** 重置用户角色：先清空再批量写入。 */
  default void replaceRoles(Long userId, List<Long> roleIds) {
    deleteRolesByUserId(userId);
    roleIds.forEach(roleId -> insertUserRole(userId, roleId));
  }
}
