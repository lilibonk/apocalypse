package io.apocalypse.system.authorization.dto.response;

/** 未终止的潜在 ALL 来源；暂停、模块关闭或未来开始不能用来绕过目标身份保护。 */
public record ProtectedGrantResp(String code, String moduleKey) {}
