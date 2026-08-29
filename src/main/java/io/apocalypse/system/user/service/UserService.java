package io.apocalypse.system.user.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.security.LoginUser;
import io.apocalypse.framework.security.LoginUserQuery;
import io.apocalypse.framework.security.PasswordPolicy;
import io.apocalypse.system.api.UserApi;
import io.apocalypse.system.api.UserSummary;
import io.apocalypse.system.dept.entity.SysDeptEntity;
import io.apocalypse.system.dept.mapper.SysDeptMapper;
import io.apocalypse.system.menu.service.MenuService;
import io.apocalypse.system.role.entity.SysRoleEntity;
import io.apocalypse.system.role.mapper.SysRoleMapper;
import io.apocalypse.system.user.dto.request.UserCreateReq;
import io.apocalypse.system.user.dto.request.UserUpdateReq;
import io.apocalypse.system.user.dto.response.CurrentUserResp;
import io.apocalypse.system.user.dto.response.UserResp;
import io.apocalypse.system.user.entity.SysUserEntity;
import io.apocalypse.system.user.mapper.SysUserMapper;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;

/**
 * 用户服务。实现两个对外端口：{@link UserApi}（跨模块 facade）与 framework 的 {@link LoginUserQuery} （登录链路接通点：framework
 * 只认该接口，不认识 system 模块）。
 */
@Service
@RequiredArgsConstructor
public class UserService implements UserApi, LoginUserQuery {

  private final SysUserMapper sysUserMapper;

  private final SysRoleMapper sysRoleMapper;

  private final SysDeptMapper sysDeptMapper;

  private final MenuService menuService;

  private final UserConvert userConvert;

  private final PasswordEncoder passwordEncoder;

  /** 自代理引用：让 {@link #getById(Long)} 复用 {@link #getDetail(Long)} 的缓存（直接 this 调用会绕过 AOP 代理）。 */
  private final ObjectProvider<UserService> self;

  /** 跨模块 facade：不存在时抛 {@code BizException(40400)}。 */
  @Override
  public UserSummary getById(Long id) {
    UserResp resp = self.getObject().getDetail(id);
    return new UserSummary(resp.id(), resp.username(), resp.nickname());
  }

  @Override
  public Optional<UserSummary> findByUsername(String username) {
    return sysUserMapper.findByUsername(username).map(userConvert::toSummary);
  }

  /** 登录查询端口：填充密码密文、角色标识与权限串，供 framework 认证与签发令牌。 */
  @Override
  public Optional<LoginUser> findLoginUserByUsername(String username) {
    return sysUserMapper
        .findByUsername(username)
        .map(
            entity ->
                new LoginUser(
                    entity.getId(),
                    entity.getUsername(),
                    entity.getPassword(),
                    entity.isEnabled(),
                    sysRoleMapper.selectByUserId(entity.getId()).stream()
                        .map(SysRoleEntity::getRoleKey)
                        .toList(),
                    menuService.permsByUserId(entity.getId())));
  }

  /** 用户详情（缓存示例：两级缓存 user；更新/删除/重置密码时 evict）。 */
  @Cacheable(cacheNames = "user", key = "#id")
  public UserResp getDetail(Long id) {
    return withDeptName(userConvert.toResp(requireById(id)));
  }

  /** 分页查询。 */
  public PageResult<UserResp> page(int page, int size, String keyword) {
    return sysUserMapper
        .pageByKeyword(page, size, keyword)
        .map(userConvert::toResp)
        .map(this::withDeptName);
  }

  /** 新增用户。密码按 {@link PasswordPolicy} 校验强度（登录不校验，仅新建/重置校验）。 */
  @Transactional
  public UserResp create(UserCreateReq req) {
    if (sysUserMapper.existsByUsername(req.username())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "用户名已存在");
    }
    PasswordPolicy.validate(req.password());
    SysUserEntity entity = new SysUserEntity();
    entity.setUsername(req.username());
    entity.setPassword(passwordEncoder.encode(req.password()));
    entity.setNickname(req.nickname());
    entity.setDeptId(requireDept(req.deptId()));
    entity.setStatus(SysUserEntity.STATUS_ENABLED);
    sysUserMapper.insert(entity);
    return withDeptName(userConvert.toResp(entity));
  }

  /** 更新用户（仅更新非空字段）。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#id")
  public UserResp update(Long id, UserUpdateReq req) {
    SysUserEntity entity = requireById(id);
    if (StringUtils.hasText(req.nickname())) {
      entity.setNickname(req.nickname());
    }
    if (req.status() != null) {
      entity.setStatus(req.status());
    }
    if (req.deptId() != null) {
      entity.setDeptId(requireDept(req.deptId()));
    }
    sysUserMapper.updateById(entity);
    return withDeptName(userConvert.toResp(sysUserMapper.selectById(id)));
  }

  /** 删除用户（逻辑删，同时清空角色关联）。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#id")
  public void delete(Long id) {
    requireById(id);
    sysUserMapper.deleteRolesByUserId(id);
    sysUserMapper.deleteById(id);
  }

  /** 重置密码：按 {@link PasswordPolicy} 校验强度后重置（admin 种子弱口令是历史妥协，仅登录放行）。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#id")
  public void resetPassword(Long id, String newPassword) {
    SysUserEntity entity = requireById(id);
    PasswordPolicy.validate(newPassword);
    entity.setPassword(passwordEncoder.encode(newPassword));
    sysUserMapper.updateById(entity);
  }

  /** 重置用户角色。角色变化影响权限串，evict 该用户的 userPerms 缓存。 */
  @Transactional
  @CacheEvict(cacheNames = "userPerms", key = "#userId")
  public void assignRoles(Long userId, List<Long> roleIds) {
    requireById(userId);
    List<Long> ids = roleIds == null ? List.of() : roleIds;
    if (!ids.isEmpty() && sysRoleMapper.selectBatchIds(ids).size() != ids.size()) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "存在无效的角色");
    }
    sysUserMapper.replaceRoles(userId, ids);
  }

  /** 当前登录用户视图（{@code /system/users/me}）。 */
  public CurrentUserResp currentUser(Long userId) {
    UserResp user = self.getObject().getDetail(userId);
    List<String> roles =
        sysRoleMapper.selectByUserId(userId).stream().map(SysRoleEntity::getRoleKey).toList();
    return new CurrentUserResp(
        user, roles, menuService.permsByUserId(userId), menuService.treeByUserId(userId));
  }

  private SysUserEntity requireById(Long id) {
    SysUserEntity entity = sysUserMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "用户不存在");
    }
    return entity;
  }

  /** 部门存在性校验：null 表示不挂接部门。 */
  private Long requireDept(Long deptId) {
    if (deptId != null && sysDeptMapper.selectById(deptId) == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "部门不存在");
    }
    return deptId;
  }

  /** 装配 deptName（非实体字段，不在 MapStruct 映射内）。 */
  private UserResp withDeptName(UserResp resp) {
    if (resp.deptId() == null) {
      return resp;
    }
    SysDeptEntity dept = sysDeptMapper.selectById(resp.deptId());
    return new UserResp(
        resp.id(),
        resp.username(),
        resp.nickname(),
        resp.status(),
        resp.deptId(),
        dept == null ? null : dept.getDeptName(),
        resp.createTime());
  }
}
