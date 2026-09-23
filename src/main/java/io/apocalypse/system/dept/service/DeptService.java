package io.apocalypse.system.dept.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.system.dept.dto.request.DeptSaveReq;
import io.apocalypse.system.dept.dto.response.DeptTreeNode;
import io.apocalypse.system.dept.entity.SysDeptEntity;
import io.apocalypse.system.dept.mapper.SysDeptMapper;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 部门服务：部门树构建（PG WITH RECURSIVE 取平铺行后在内存组装嵌套树）与 CRUD。 */
@Service
@RequiredArgsConstructor
public class DeptService {

  private final SysDeptMapper sysDeptMapper;

  /** 全量部门树。 */
  public List<DeptTreeNode> tree() {
    return buildTree(sysDeptMapper.selectTree());
  }

  /** 新增部门，返回主键。 */
  @Transactional
  public Long create(DeptSaveReq req) {
    sysDeptMapper.lockHierarchy();
    requireParent(req.parentId());
    SysDeptEntity entity = new SysDeptEntity();
    applyReq(entity, req);
    sysDeptMapper.insert(entity);
    return entity.getId();
  }

  /** 更新部门。新父部门不得为自身或自身子树内的节点（防循环导致递归 CTE 死循环）。 */
  @Transactional
  public void update(Long id, DeptSaveReq req) {
    sysDeptMapper.lockHierarchy();
    SysDeptEntity entity = requireById(id);
    if (req.parentId() != 0) {
      requireParent(req.parentId());
      Set<Long> subTreeIds =
          sysDeptMapper.selectSubTree(id).stream()
              .map(SysDeptEntity::getId)
              .collect(Collectors.toSet());
      if (subTreeIds.contains(req.parentId())) {
        throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "父部门不能是自身或其下级部门");
      }
    }
    applyReq(entity, req);
    ConcurrencyGuard.requireSingleRow(sysDeptMapper.updateById(entity));
  }

  /** 删除部门（逻辑删）。存在子部门或挂接用户时不允许删除。 */
  @Transactional
  public void delete(Long id) {
    sysDeptMapper.lockHierarchy();
    requireById(id);
    if (sysDeptMapper.existsByParentId(id)) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "存在子部门，不允许删除");
    }
    if (sysDeptMapper.countAssignedUsers(id) > 0) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "部门下存在用户，不允许删除");
    }
    ConcurrencyGuard.requireSingleRow(sysDeptMapper.deleteById(id));
  }

  private SysDeptEntity requireById(Long id) {
    SysDeptEntity entity = sysDeptMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "部门不存在");
    }
    return entity;
  }

  /** 用户域挂接部门前的稳定查询入口；null 表示不挂接部门。 */
  public void requireExistingId(Long id) {
    if (id != null) {
      requireById(id);
    }
  }

  /** 部门名称查询入口；已删除或不存在时返回 null，避免详情装配因历史关联失败。 */
  public String nameOf(Long id) {
    SysDeptEntity entity = id == null ? null : sysDeptMapper.selectById(id);
    return entity == null ? null : entity.getDeptName();
  }

  /** 父部门存在性校验（parentId=0 为根，无需校验）。 */
  private void requireParent(Long parentId) {
    if (parentId != null && parentId != 0 && sysDeptMapper.selectById(parentId) == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "父部门不存在");
    }
  }

  private static void applyReq(SysDeptEntity entity, DeptSaveReq req) {
    entity.setParentId(req.parentId());
    entity.setDeptName(req.deptName());
    entity.setLeader(req.leader());
    entity.setPhone(req.phone());
    entity.setSort(req.sort() == null ? 0 : req.sort());
    entity.setStatus(req.status() == null ? SysDeptEntity.STATUS_ENABLED : req.status());
    entity.setRemark(req.remark());
  }

  /** 构建部门树：parentId 为 0 或父节点不在集合内的视为根，子节点按 sort 排序（同菜单树约定）。 */
  private static List<DeptTreeNode> buildTree(List<SysDeptEntity> depts) {
    Map<Long, List<SysDeptEntity>> childrenByParent =
        depts.stream().collect(Collectors.groupingBy(SysDeptEntity::getParentId));
    Set<Long> ids = depts.stream().map(SysDeptEntity::getId).collect(Collectors.toSet());
    return depts.stream()
        .filter(dept -> dept.getParentId() == 0 || !ids.contains(dept.getParentId()))
        .sorted(Comparator.comparing(SysDeptEntity::getSort))
        .map(dept -> toNode(dept, childrenByParent))
        .toList();
  }

  private static DeptTreeNode toNode(
      SysDeptEntity entity, Map<Long, List<SysDeptEntity>> childrenByParent) {
    List<DeptTreeNode> children =
        childrenByParent.getOrDefault(entity.getId(), List.of()).stream()
            .sorted(Comparator.comparing(SysDeptEntity::getSort))
            .map(child -> toNode(child, childrenByParent))
            .toList();
    return new DeptTreeNode(
        entity.getId(),
        entity.getParentId(),
        entity.getDeptName(),
        entity.getLeader(),
        entity.getPhone(),
        entity.getSort(),
        entity.getStatus(),
        entity.getRemark(),
        children);
  }
}
