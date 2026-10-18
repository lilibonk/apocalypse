package io.apocalypse.system.user.dto.response;

import io.apocalypse.system.menu.dto.response.MenuTreeNode;

import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** 当前登录用户视图（{@code GET /system/users/me}）：前端登录后取数端点。 */
public record CurrentUserResp(
    UserResp user,
    List<String> roles,
    List<String> perms,
    List<MenuTreeNode> menus,
    String authorizationSnapshotId,
    Instant evaluatedAt,
    @Schema(nullable = true) Instant nextTransitionAt,
    List<String> allScopePerms) {}
