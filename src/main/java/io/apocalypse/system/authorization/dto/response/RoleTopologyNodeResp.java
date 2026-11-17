package io.apocalypse.system.authorization.dto.response;

import java.util.List;

/** 角色业务穿透拓扑节点：承载角色属性、可见成员样本与按业务域聚合的生效权限等级。 */
public record RoleTopologyNodeResp(
    Long roleId,
    String roleName,
    String roleKey,
    int status,
    String dataScope,
    long memberCount,
    long visibleMemberCount,
    List<InsightUserResp> sampleMembers,
    long activeGrantCount,
    long navigationCount,
    List<RoleDomainAccessResp> domainAccess) {

  public RoleTopologyNodeResp {
    sampleMembers = sampleMembers == null ? List.of() : List.copyOf(sampleMembers);
    domainAccess = domainAccess == null ? List.of() : List.copyOf(domainAccess);
  }
}
