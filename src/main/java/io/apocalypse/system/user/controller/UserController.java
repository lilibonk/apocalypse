package io.apocalypse.system.user.controller;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.system.user.dto.request.ResetPasswordReq;
import io.apocalypse.system.user.dto.request.UserCreateReq;
import io.apocalypse.system.user.dto.request.UserUpdateReq;
import io.apocalypse.system.user.dto.response.CurrentUserResp;
import io.apocalypse.system.user.dto.response.UserResp;
import io.apocalypse.system.user.service.UserService;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/**
 * 用户管理端点。 写操作按 V1 种子 perms 鉴权（{@code system:user:add/edit/remove}），读操作 {@code system:user:list}。
 */
@RestController
@RequestMapping("/system/users")
@RequiredArgsConstructor
public class UserController {

  private final UserService userService;

  /** 当前登录用户视图（用户/角色/权限/菜单树），仅需认证。 */
  @GetMapping("/me")
  public CurrentUserResp me() {
    Long userId =
        SecurityUtils.currentUserId().orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
    return userService.currentUser(userId);
  }

  /** 分页查询。 */
  @GetMapping("/page")
  @PreAuthorize("hasAuthority('system:user:list')")
  public PageResult<UserResp> page(
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(required = false) String keyword) {
    return userService.page(page, size, keyword);
  }

  /** 详情。 */
  @GetMapping("/{id}")
  @PreAuthorize("hasAuthority('system:user:list')")
  public UserResp getById(@PathVariable Long id) {
    return userService.getDetail(id);
  }

  /** 新增。 */
  @PostMapping
  @PreAuthorize("hasAuthority('system:user:add')")
  @OperLog(title = "用户管理", businessType = "INSERT")
  public UserResp create(@Validated @RequestBody UserCreateReq req) {
    return userService.create(req);
  }

  /** 更新。 */
  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('system:user:edit')")
  @OperLog(title = "用户管理", businessType = "UPDATE")
  public UserResp update(@PathVariable Long id, @Validated @RequestBody UserUpdateReq req) {
    return userService.update(id, req);
  }

  /** 删除（逻辑删）。 */
  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('system:user:remove')")
  @OperLog(title = "用户管理", businessType = "DELETE")
  public void delete(@PathVariable Long id) {
    userService.delete(id);
  }

  /** 重置用户角色。 */
  @PutMapping("/{id}/roles")
  @PreAuthorize("hasAuthority('system:user:edit')")
  @OperLog(title = "用户管理", businessType = "GRANT")
  public void assignRoles(@PathVariable Long id, @RequestBody List<Long> roleIds) {
    userService.assignRoles(id, roleIds);
  }

  /** 重置密码（PasswordPolicy 校验强度）。 */
  @PutMapping("/{id}/password")
  @PreAuthorize("hasAuthority('system:user:edit')")
  @OperLog(title = "用户管理", businessType = "UPDATE")
  public void resetPassword(@PathVariable Long id, @Validated @RequestBody ResetPasswordReq req) {
    userService.resetPassword(id, req.newPassword());
  }
}
