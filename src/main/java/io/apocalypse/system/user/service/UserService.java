package io.apocalypse.system.user.service;

import io.apocalypse.common.csv.SafeCsvSupport;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.security.AuthService;
import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.LoginUser;
import io.apocalypse.framework.security.LoginUserQuery;
import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.framework.security.PasswordPolicy;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.system.api.UserApi;
import io.apocalypse.system.api.UserSummary;
import io.apocalypse.system.authorization.dto.response.DataScopeResp;
import io.apocalypse.system.authorization.service.AuthorizationReadService;
import io.apocalypse.system.authorization.service.DataScopeService;
import io.apocalypse.system.dept.dto.response.DeptPathNodeResp;
import io.apocalypse.system.dept.dto.response.DeptTreeNode;
import io.apocalypse.system.dept.service.DeptService;
import io.apocalypse.system.menu.service.MenuService;
import io.apocalypse.system.role.dto.response.UserRoleSummaryResp;
import io.apocalypse.system.role.service.RoleService;
import io.apocalypse.system.user.dto.request.SelfPasswordUpdateReq;
import io.apocalypse.system.user.dto.request.SelfProfileUpdateReq;
import io.apocalypse.system.user.dto.request.UserCreateReq;
import io.apocalypse.system.user.dto.request.UserUpdateReq;
import io.apocalypse.system.user.dto.response.CsvImportResultResp;
import io.apocalypse.system.user.dto.response.CurrentUserResp;
import io.apocalypse.system.user.dto.response.SelfSessionResp;
import io.apocalypse.system.user.dto.response.UserResp;
import io.apocalypse.system.user.entity.SysUserEntity;
import io.apocalypse.system.user.mapper.SysUserMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
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

  private final DataScopeService dataScopeService;

  private final AuthorizationReadService authorizationReadService;

  private static final String BOOTSTRAP_DISABLED_PASSWORD = "{bootstrap-disabled}";

  private final SysUserMapper sysUserMapper;

  private final RoleService roleService;

  private final DeptService deptService;

  private final MenuService menuService;

  private final UserConvert userConvert;

  private final PasswordEncoder passwordEncoder;

  private final TokenVersionStore tokenVersionStore;

  private final OnlineUserRegistry onlineUserRegistry;

  private final AuthService authService;

  /**
   * 自代理引用：让 {@link #getById(Long)} 复用 {@link #getIdentityDetail(Long)} 的缓存（直接 this 调用会绕过 AOP 代理）。
   */
  private final ObjectProvider<UserService> self;

  /** 查询未删除用户的当前所属部门（跨子域只读契约）。 */
  public Long findActiveDeptId(Long userId) {
    if (userId == null) {
      return null;
    }
    SysUserEntity entity = sysUserMapper.selectById(userId);
    return entity == null ? null : entity.getDeptId();
  }

  /** 跨模块 facade：不存在时抛 {@code BizException(40400)}。 */
  @Override
  public UserSummary getById(Long id) {
    UserResp resp = self.getObject().getIdentityDetail(id);
    return new UserSummary(resp.id(), resp.username(), resp.nickname());
  }

  @Override
  public Optional<UserSummary> findByUsername(String username) {
    return sysUserMapper.findByUsername(username).map(userConvert::toSummary);
  }

  /** 登录查询端口：以同一 PostgreSQL 快照装配密码、状态、角色、未缓存权限和撤销版本，防止签出旧权限 + 新版本的撕裂 JWT。 */
  @Override
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Optional<LoginUser> findLoginUserByUsername(String username) {
    return sysUserMapper
        .findByUsername(username)
        .map(
            entity -> {
              var authorization =
                  entity.isEnabled()
                      ? authorizationReadService.snapshotForUser(entity.getId())
                      : null;
              return new LoginUser(
                  entity.getId(),
                  entity.getUsername(),
                  entity.getPassword(),
                  entity.isEnabled(),
                  authorization == null ? List.of() : authorization.roles(),
                  authorization == null ? List.of() : authorization.permissions(),
                  authorization == null
                      ? tokenVersionStore.current(entity.getUsername())
                      : authorization.versions());
            });
  }

  /** 用户详情（缓存示例：两级缓存 user；更新/删除/重置密码时 evict）。 */
  @Cacheable(cacheNames = "user", key = "#id", sync = true)
  public UserResp getIdentityDetail(Long id) {
    return withDeptName(userConvert.toResp(requireById(id)));
  }

  /** 管理详情在缓存外用当前范围检查，内部 facade/login/me 继续走身份查询。 */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public UserResp getDetail(Long id) {
    DataScopeResp scope = dataScopeService.resolve("system:user:list");
    SysUserEntity entity = requireById(id);
    if (!scope.permits(entity.getDeptId())) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "用户不存在");
    }
    UserResp current = withDeptName(userConvert.toResp(entity));
    UserResp cached = self.getObject().getIdentityDetail(id);
    // 管理读取保持数据库授权快照；跨事务缓存不允许把更旧/更新的部门或身份回填进已授权结果。
    return current.equals(cached) ? cached : current;
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public List<DeptTreeNode> departmentOptions(String operation) {
    String permission =
        switch (operation) {
          case "CREATE" -> "system:user:add";
          case "UPDATE" -> "system:user:edit";
          default ->
              throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "操作仅支持 CREATE/UPDATE");
        };
    return deptService.options(dataScopeService.resolve(permission));
  }

  /** 分页查询。 */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public PageResult<UserResp> page(int page, int size, String keyword) {
    return page(page, size, keyword, null, false);
  }

  /** 分页查询，可按部门（及其下级）筛选；部门条件与当前动作数据范围取交集。 */
  public PageResult<UserResp> page(
      int page, int size, String keyword, Long deptId, boolean includeChildren) {
    return page(page, size, keyword, deptId, includeChildren, null, null);
  }

  /** 分页查询，支持受控列排序（{@code createTime} / {@code username}）。 */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public PageResult<UserResp> page(
      int page,
      int size,
      String keyword,
      Long deptId,
      boolean includeChildren,
      String sortField,
      String sortOrder) {
    return page(page, size, keyword, deptId, includeChildren, sortField, sortOrder, null);
  }

  /** 分页查询，支持按状态精确过滤及受控列排序（{@code createTime} / {@code username}）。 */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public PageResult<UserResp> page(
      int page,
      int size,
      String keyword,
      Long deptId,
      boolean includeChildren,
      String sortField,
      String sortOrder,
      Integer status) {
    DataScopeResp scope = dataScopeService.resolve("system:user:list");
    PageResult<SysUserEntity> rawPage =
        status == null
            ? sysUserMapper.pageByKeyword(
                page, size, keyword, scope, deptId, includeChildren, sortField, sortOrder)
            : sysUserMapper.pageByKeyword(
                page, size, keyword, scope, deptId, includeChildren, sortField, sortOrder, status);
    PageResult<UserResp> basePage = rawPage.map(userConvert::toResp);
    return new PageResult<>(
        enrichUserResps(basePage.list()), basePage.total(), basePage.page(), basePage.size());
  }

  /** 按当前授权数据范围导出用户 CSV（UTF-8 BOM + 公式注入防护，单次上限 2000 行）。 */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public byte[] exportCsv(String keyword, Long deptId, boolean includeChildren) {
    return exportCsv(keyword, deptId, includeChildren, null);
  }

  /** 按当前授权数据范围及筛选条件导出用户 CSV（UTF-8 BOM + 公式注入防护，单次上限 2000 行）。 */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public byte[] exportCsv(String keyword, Long deptId, boolean includeChildren, Integer status) {
    DataScopeResp scope = dataScopeService.resolve("system:user:list");
    List<List<String>> rows = new java.util.ArrayList<>();
    int pageSize = 200;
    for (int pageNo = 1; pageNo <= 10; pageNo++) {
      PageResult<SysUserEntity> rawBatch =
          status == null
              ? sysUserMapper.pageByKeyword(
                  pageNo, pageSize, keyword, scope, deptId, includeChildren)
              : sysUserMapper.pageByKeyword(
                  pageNo, pageSize, keyword, scope, deptId, includeChildren, null, null, status);
      PageResult<UserResp> baseBatch = rawBatch.map(userConvert::toResp);
      List<UserResp> batchList = enrichUserResps(baseBatch.list());
      for (UserResp u : batchList) {
        rows.add(
            List.of(
                u.id() == null ? "" : String.valueOf(u.id()),
                u.username() == null ? "" : u.username(),
                u.nickname() == null ? "" : u.nickname(),
                u.deptName() == null ? "" : u.deptName(),
                u.status() != null && u.status() == SysUserEntity.STATUS_ENABLED ? "正常" : "停用",
                u.createTime() == null ? "" : u.createTime().toString().replace('T', ' ')));
      }
      if (batchList.size() < pageSize || rows.size() >= baseBatch.total()) {
        break;
      }
    }
    return SafeCsvSupport.writeUtf8BomCsv(List.of("用户ID", "用户名", "昵称", "部门", "状态", "创建时间"), rows);
  }

  /** 检查用户名是否已存在（供表单失焦防抖预检）。 */
  @Transactional(readOnly = true)
  public boolean existsByUsername(String username) {
    if (!StringUtils.hasText(username)) {
      return false;
    }
    return sysUserMapper.existsByUsername(username.trim());
  }

  /** 生成用户批量导入标准 CSV 模板（带 UTF-8 BOM）。 */
  public byte[] exportImportTemplateCsv() {
    return SafeCsvSupport.writeUtf8BomCsv(
        List.of("username", "nickname", "password", "deptId"),
        List.of(List.of("demo_user", "示例用户", "Demo@123456", "")));
  }

  /** 批量导入用户 CSV（单次上限 500 行）：逐行校验格式、密码强度、部门范围与重名，返回成功/失败行数及逐行错误明细。 */
  public CsvImportResultResp importCsv(byte[] bytes) {
    if (bytes == null || bytes.length == 0) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "CSV 文件内容不能为空");
    }
    List<Map<String, String>> parsedRows = SafeCsvSupport.parseCsv(bytes, 500);
    if (parsedRows.isEmpty()) {
      return new CsvImportResultResp(0, 0, 0, List.of());
    }
    int successCount = 0;
    int failureCount = 0;
    List<String> errors = new ArrayList<>();
    for (int i = 0; i < parsedRows.size(); i++) {
      int lineNo = i + 2;
      Map<String, String> row = parsedRows.get(i);
      String username = firstCell(row, "username", "用户名");
      String nickname = firstCell(row, "nickname", "昵称");
      String password = firstCell(row, "password", "密码");
      String deptIdText = firstCell(row, "deptId", "部门ID");
      try {
        if (!StringUtils.hasText(username)) {
          throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "用户名不能为空");
        }
        if (username.length() > 64) {
          throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "用户名长度不能超过 64");
        }
        if (!StringUtils.hasText(password)) {
          throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "密码不能为空");
        }
        Long deptId = null;
        if (StringUtils.hasText(deptIdText)) {
          try {
            deptId = Long.parseLong(deptIdText);
          } catch (NumberFormatException ex) {
            throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "部门ID格式非法: " + deptIdText);
          }
        }
        UserCreateReq request =
            new UserCreateReq(
                username, password, StringUtils.hasText(nickname) ? nickname : null, deptId);
        String encodedPassword = null;
        BizException invalidPassword = null;
        try {
          PasswordPolicy.validate(password);
          encodedPassword = passwordEncoder.encode(password);
        } catch (BizException ex) {
          invalidPassword = ex;
        }
        self.getObject().insertCsvRow(request, encodedPassword, invalidPassword);
        successCount++;
      } catch (BizException ex) {
        if (ex.getCode() == ErrorCode.FORBIDDEN.getCode()
            || ex.getCode() == ErrorCode.UNAUTHORIZED.getCode()) {
          throw ex;
        }
        failureCount++;
        String label = StringUtils.hasText(username) ? username : "未填用户名";
        errors.add("第 " + lineNo + " 行（" + label + "）：" + ex.getMessage());
      }
    }
    return new CsvImportResultResp(parsedRows.size(), successCount, failureCount, errors);
  }

  private static String firstCell(Map<String, String> row, String primaryKey, String aliasKey) {
    String val = row.get(primaryKey);
    if (val == null) {
      val = row.get(aliasKey);
    }
    return val == null ? "" : val.trim();
  }

  /** 新增用户。密码按 {@link PasswordPolicy} 校验强度（登录不校验，仅新建/重置校验）。 */
  @Transactional
  public UserResp create(UserCreateReq req) {
    dataScopeService.lockForWrite();
    DataScopeResp scope = dataScopeService.resolve("system:user:add");
    requireTargetDepartment(scope, req.deptId(), true);
    if (sysUserMapper.existsByUsername(req.username())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "用户名已存在");
    }
    PasswordPolicy.validate(req.password());
    SysUserEntity entity = newUser(req, passwordEncoder.encode(req.password()));
    sysUserMapper.insert(entity);
    return withDeptName(userConvert.toResp(entity));
  }

  /** 每行独立提交；持写锁期间重新核验授权和部门，重名由唯一索引判定。 */
  @Transactional
  public void insertCsvRow(
      UserCreateReq req, String encodedPassword, BizException invalidPassword) {
    dataScopeService.lockForWrite();
    DataScopeResp scope = dataScopeService.resolve("system:user:add");
    requireTargetDepartment(scope, req.deptId(), true);
    if (invalidPassword != null) {
      if (sysUserMapper.existsByUsername(req.username())) {
        throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "用户名已存在");
      }
      throw invalidPassword;
    }
    if (sysUserMapper.insertIgnoringDuplicateUsername(newUser(req, encodedPassword)) == 0) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "用户名已存在");
    }
  }

  private static SysUserEntity newUser(UserCreateReq req, String encodedPassword) {
    SysUserEntity entity = new SysUserEntity();
    entity.setUsername(req.username());
    entity.setPassword(encodedPassword);
    entity.setNickname(req.nickname());
    entity.setDeptId(req.deptId());
    entity.setStatus(SysUserEntity.STATUS_ENABLED);
    return entity;
  }

  /** 更新显式提交的用户字段，部门清空要求全部数据范围。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#id")
  public UserResp update(Long id, UserUpdateReq req) {
    dataScopeService.lockForWrite();
    DataScopeResp scope = dataScopeService.resolve("system:user:edit");
    if (req.deptIdPresent() && req.deptId() == null && !scope.all()) {
      throw new BizException(ErrorCode.FORBIDDEN.getCode(), "清空用户部门需要全部数据范围");
    }
    SysUserEntity entity = requireById(id);
    dataScopeService.requireWritableTarget(scope, id, entity.getDeptId());
    Long originalDeptId = entity.getDeptId();
    Integer originalVersion = entity.getVersion();
    boolean departmentChanged =
        req.deptIdPresent() && !Objects.equals(req.deptId(), originalDeptId);
    if (req.deptIdPresent()) {
      requireTargetDepartment(scope, req.deptId(), false);
      entity.setDeptId(requireDept(req.deptId()));
    }
    boolean credentialChanged =
        req.status() != null && !Objects.equals(req.status(), entity.getStatus());
    if (req.nicknamePresent()) {
      entity.setNickname(req.nickname());
    }
    if (req.status() != null) {
      entity.setStatus(req.status());
    }
    entity.setUpdateBy(SecurityUtils.currentUsername().orElse(null));
    ConcurrencyGuard.requireSingleRow(
        sysUserMapper.updateWithinScope(entity, originalDeptId, originalVersion, scope));
    if (departmentChanged) {
      tokenVersionStore.invalidateUserAuthorization(entity.getUsername());
    }
    if (credentialChanged) {
      tokenVersionStore.invalidateCredential(entity.getUsername());
    }
    return withDeptName(userConvert.toResp(sysUserMapper.selectById(id)));
  }

  /** 删除用户（逻辑删，同时清空角色关联）。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#id")
  public void delete(Long id) {
    dataScopeService.lockForWrite();
    DataScopeResp scope = dataScopeService.resolve("system:user:remove");
    SysUserEntity entity = requireById(id);
    dataScopeService.requireWritableTarget(scope, id, entity.getDeptId());
    entity.setUpdateBy(SecurityUtils.currentUsername().orElse(null));
    List<Long> roleIds = sysUserMapper.selectRoleIdsByUserId(id);
    ConcurrencyGuard.requireSingleRow(sysUserMapper.deleteWithinScope(entity, scope));
    sysUserMapper.deleteRolesByUserId(id);
    roleService.recordUserRoleChange(id, roleIds, List.of());
    tokenVersionStore.invalidateCredential(entity.getUsername());
  }

  /** 批量删除用户（事务内逐条执行数据范围与受保护账号校验，任一越权整体回滚）。 */
  @Transactional
  public void deleteBatch(List<Long> ids) {
    if (ids == null || ids.isEmpty()) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "待删除用户ID列表不能为空");
    }
    for (Long id : ids) {
      if (id == null) {
        throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "待删除用户ID不能为空");
      }
      self.getObject().delete(id);
    }
  }

  /** 重置密码：按 {@link PasswordPolicy} 校验强度后重置（admin 种子弱口令是历史妥协，仅登录放行）。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#id")
  public void resetPassword(Long id, String newPassword) {
    dataScopeService.lockForWrite();
    DataScopeResp scope = dataScopeService.resolve("system:user:edit");
    SysUserEntity entity = requireById(id);
    dataScopeService.requireWritableTarget(scope, id, entity.getDeptId());
    PasswordPolicy.validate(newPassword);
    entity.setPassword(passwordEncoder.encode(newPassword));
    entity.setUpdateBy(SecurityUtils.currentUsername().orElse(null));
    ConcurrencyGuard.requireSingleRow(
        sysUserMapper.updateWithinScope(entity, entity.getDeptId(), entity.getVersion(), scope));
    tokenVersionStore.invalidateCredential(entity.getUsername());
  }

  /** 重置用户角色。权限缓存含能力指纹，整体失效覆盖不同实例的全部指纹变体；同时驱逐该用户的详情缓存。 */
  @Transactional
  @Caching(
      evict = {
        @CacheEvict(cacheNames = "userPerms", allEntries = true),
        @CacheEvict(cacheNames = "user", key = "#userId")
      })
  public void assignRoles(Long userId, List<Long> roleIds) {
    dataScopeService.requireGlobalWrite("system:user:edit");
    SysUserEntity user = requireById(userId);
    List<Long> ids = roleIds == null ? List.of() : roleIds;
    roleService.requireValidRoleIds(ids);
    List<Long> before = sysUserMapper.selectRoleIdsByUserId(userId);
    sysUserMapper.replaceRoles(userId, ids);
    roleService.recordUserRoleChange(userId, before, ids);
    tokenVersionStore.invalidateUserAuthorization(user.getUsername());
  }

  /** 用显式部署密码一次性启用 V1 的禁用 bootstrap 管理员。仅哨兵密码状态可执行，已启用或已改密账号绝不被覆盖。 */
  @Transactional
  public boolean initializeBootstrapAdmin(String username, String password) {
    SysUserEntity entity = sysUserMapper.findByUsername(username).orElse(null);
    if (entity == null
        || entity.isEnabled()
        || !BOOTSTRAP_DISABLED_PASSWORD.equals(entity.getPassword())) {
      return false;
    }
    PasswordPolicy.validate(password);
    if (sysUserMapper.enableBootstrapAdmin(username, passwordEncoder.encode(password)) == 0) {
      return false;
    }
    tokenVersionStore.invalidateCredential(entity.getUsername());
    return true;
  }

  /** 当前登录用户视图（{@code /system/users/me}）。 */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public CurrentUserResp currentUser(Long userId) {
    var authorization = authorizationReadService.snapshotForUser(userId);
    LiveAuthorizationService.requireMatchingIdentity(
        LiveAuthorizationService.requireUserToken(
            SecurityContextHolder.getContext().getAuthentication()),
        authorization);
    UserResp user = withDeptName(userConvert.toResp(requireById(userId)));
    return new CurrentUserResp(
        user,
        authorization.roles(),
        authorization.permissions(),
        menuService.treeByUserId(userId),
        authorization.snapshotId(),
        authorization.evaluatedAt(),
        authorization.nextTransitionAt(),
        authorization.allScopePerms());
  }

  /** 当前登录用户自助修改个人资料（仅允许修改自身展示昵称）。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#userId")
  public UserResp updateSelfProfile(Long userId, SelfProfileUpdateReq req) {
    SysUserEntity entity = requireById(userId);
    entity.setNickname(req.nickname().trim());
    entity.setUpdateBy(entity.getUsername());
    ConcurrencyGuard.requireSingleRow(sysUserMapper.updateById(entity));
    return withDeptName(userConvert.toResp(sysUserMapper.selectById(userId)));
  }

  /** 当前登录用户自助修改密码：核验原密码 + 校验新密码强度 + 递增凭证版本全量撤销旧令牌。 */
  @Transactional
  @CacheEvict(cacheNames = "user", key = "#userId")
  public void changeSelfPassword(Long userId, SelfPasswordUpdateReq req) {
    SysUserEntity entity = requireById(userId);
    if (!passwordEncoder.matches(req.oldPassword(), entity.getPassword())) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "原密码不正确");
    }
    PasswordPolicy.validate(req.newPassword());
    entity.setPassword(passwordEncoder.encode(req.newPassword()));
    entity.setUpdateBy(entity.getUsername());
    ConcurrencyGuard.requireSingleRow(sysUserMapper.updateById(entity));
    authService.revokeAllSessions(entity.getUsername());
  }

  /** 当前登录用户的活跃在线会话列表。 */
  public List<SelfSessionResp> listSelfSessions(String username, String currentJti) {
    return onlineUserRegistry.listByUsername(username).stream()
        .map(
            session ->
                new SelfSessionResp(
                    session.jti(),
                    session.user().loginTime(),
                    session.user().ip(),
                    session.user().userAgent(),
                    Objects.equals(currentJti, session.jti())))
        .toList();
  }

  /** 当前登录用户自助下线单条设备会话（严格校验会话归属当前用户，防横向越权）。 */
  public void revokeSelfSession(String username, String jti) {
    onlineUserRegistry
        .find(jti)
        .filter(user -> username.equals(user.username()))
        .orElseThrow(() -> new BizException(ErrorCode.NOT_FOUND.getCode(), "会话不存在或已下线"));
    authService.kickUser(jti);
  }

  /** 当前登录用户自助注销全部设备会话（递增数据库凭证版本并清理全部在线条目）。 */
  @Transactional
  public void revokeAllSelfSessions(String username) {
    authService.revokeAllSessions(username);
  }

  private SysUserEntity requireById(Long id) {
    SysUserEntity entity = sysUserMapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "用户不存在");
    }
    return entity;
  }

  private void requireTargetDepartment(DataScopeResp scope, Long departmentId, boolean creating) {
    if (!scope.all() && departmentId == null && creating) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "受限范围新增用户必须选择有效部门");
    }
    if (!scope.permits(departmentId)) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "部门不存在");
    }
    deptService.requireActiveId(departmentId);
  }

  /** 部门存在性校验：null 表示不挂接部门。 */
  private Long requireDept(Long deptId) {
    deptService.requireExistingId(deptId);
    return deptId;
  }

  /** 装配单条用户的部门路径、部门名与角色摘要（非实体字段，不在 MapStruct 映射内）。 */
  private UserResp withDeptName(UserResp resp) {
    if (resp == null) {
      return null;
    }
    return enrichUserResps(List.of(resp)).getFirst();
  }

  /**
   * 批量装配用户列表的部门路径（{@code deptPath}）、末端部门名称（{@code deptName}）与角色摘要（{@code roles}）。
   *
   * <p>无论分页条数多少，恒定最多调用 1 次 {@link DeptService#resolveDeptPaths} 与 1 次 {@link
   * RoleService#mapRoleSummariesByUserIds}，彻底消除逐行 N+1 查询。
   */
  private List<UserResp> enrichUserResps(List<UserResp> baseResps) {
    if (baseResps == null || baseResps.isEmpty()) {
      return List.of();
    }
    Set<Long> deptIds =
        baseResps.stream()
            .filter(Objects::nonNull)
            .map(UserResp::deptId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    Set<Long> userIds =
        baseResps.stream()
            .filter(Objects::nonNull)
            .map(UserResp::id)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    Map<Long, List<DeptPathNodeResp>> pathsByDeptId =
        deptIds.isEmpty()
            ? Map.of()
            : Objects.requireNonNullElse(deptService.resolveDeptPaths(deptIds), Map.of());
    Map<Long, List<UserRoleSummaryResp>> rolesByUserId =
        userIds.isEmpty()
            ? Map.of()
            : Objects.requireNonNullElse(roleService.mapRoleSummariesByUserIds(userIds), Map.of());
    List<UserResp> result = new ArrayList<>(baseResps.size());
    for (UserResp resp : baseResps) {
      if (resp == null) {
        continue;
      }
      List<DeptPathNodeResp> deptPath =
          resp.deptId() == null ? List.of() : pathsByDeptId.getOrDefault(resp.deptId(), List.of());
      String deptName =
          !deptPath.isEmpty()
              ? deptPath.getLast().deptName()
              : (resp.deptId() == null ? null : deptService.nameOf(resp.deptId()));
      List<UserRoleSummaryResp> roles =
          resp.id() == null ? List.of() : rolesByUserId.getOrDefault(resp.id(), List.of());
      result.add(
          new UserResp(
              resp.id(),
              resp.username(),
              resp.nickname(),
              resp.status(),
              resp.deptId(),
              deptName,
              deptPath,
              roles,
              resp.createTime()));
    }
    return result;
  }
}
