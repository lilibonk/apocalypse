-- V6：JWT 撤销代次持久化。
-- 权限、账号状态、删除和改密事务直接递增本表；Redis 不再作为安全版本真源，避免数据回退后旧 JWT 复活。

CREATE TABLE security_token_version (
    version_key   VARCHAR(255) PRIMARY KEY,
    version_value BIGINT       NOT NULL,
    CONSTRAINT ck_security_token_version_non_negative CHECK (version_value >= 0)
);

COMMENT ON TABLE security_token_version IS 'JWT 授权与凭证撤销代次（PostgreSQL 持久化真源）';
COMMENT ON COLUMN security_token_version.version_key IS 'authorization:global / authorization:user:<username> / credential:user:<username>';
COMMENT ON COLUMN security_token_version.version_value IS '单调递增撤销代次';
