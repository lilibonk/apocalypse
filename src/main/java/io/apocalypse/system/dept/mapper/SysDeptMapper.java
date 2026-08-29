package io.apocalypse.system.dept.mapper;

import io.apocalypse.system.dept.entity.SysDeptEntity;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

/**
 * 部门 Mapper。树查询用 PostgreSQL WITH RECURSIVE（替代 ancestors 冗余列，约定见 AGENTS.md §5）； MP 类型封装在 default
 * 方法内（约定见 {@link SysUserMapper}）。
 */
public interface SysDeptMapper extends BaseMapper<SysDeptEntity> {

  /** 整棵树（自根节点递归向下，按 sort 排序；逻辑删除显式过滤）。 */
  @Select(
      """
      WITH RECURSIVE dept_tree AS (
        SELECT * FROM sys_dept WHERE parent_id = 0 AND deleted = 0
        UNION ALL
        SELECT d.* FROM sys_dept d
        JOIN dept_tree t ON d.parent_id = t.id
        WHERE d.deleted = 0
      )
      SELECT * FROM dept_tree ORDER BY sort
      """)
  List<SysDeptEntity> selectTree();

  /** 以 rootId 为根的子树（含 rootId 自身）。 */
  @Select(
      """
      WITH RECURSIVE dept_tree AS (
        SELECT * FROM sys_dept WHERE id = #{rootId} AND deleted = 0
        UNION ALL
        SELECT d.* FROM sys_dept d
        JOIN dept_tree t ON d.parent_id = t.id
        WHERE d.deleted = 0
      )
      SELECT * FROM dept_tree ORDER BY sort
      """)
  List<SysDeptEntity> selectSubTree(@Param("rootId") Long rootId);

  /** 是否存在子部门（删除前校验）。 */
  default boolean existsByParentId(Long parentId) {
    return selectCount(
            new LambdaQueryWrapper<SysDeptEntity>().eq(SysDeptEntity::getParentId, parentId))
        > 0;
  }
}
