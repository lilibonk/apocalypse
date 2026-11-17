package io.apocalypse.system.authorization.dto.response;

/** 角色在单个业务能力域上的生效授权汇总（区分 GOVERN 读写治理与 READ 只读调阅）。 */
public record RoleDomainAccessResp(
    String domainKey, long activeGrantCount, long writeGrantCount, String accessLevel) {}
