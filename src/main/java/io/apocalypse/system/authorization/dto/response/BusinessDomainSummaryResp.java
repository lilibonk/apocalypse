package io.apocalypse.system.authorization.dto.response;

/** 授权全景中的业务能力域汇总（用于角色业务穿透拓扑右栏）。 */
public record BusinessDomainSummaryResp(
    String domainKey, String moduleKey, boolean moduleEnabled, long totalPermissions) {}
