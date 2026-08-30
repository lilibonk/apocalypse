-- V7：修复 V1 公共已知管理员口令。
-- 仅处理仍持有 V1 原始 BCrypt 哈希的 admin；已经人工改密的现有管理员保持原状。
-- 应用可通过显式 APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD 一次性启用该禁用账号，成功后不会再次覆盖密码。

WITH remediated AS (
    UPDATE sys_user
    SET password = '{bootstrap-disabled}',
        status = 0,
        update_time = now(),
        update_by = 'security-migration',
        version = version + 1
    WHERE username = 'admin'
      AND deleted = 0
      AND password = '$2a$10$nmw6yWuMnO40cxRPPAl9cOms0eubpHOjB5QyEfs/6LFEr/Y03yEgS'
    RETURNING username
)
INSERT INTO security_token_version (version_key, version_value)
SELECT 'credential:user:' || username, 1 FROM remediated
ON CONFLICT (version_key) DO UPDATE
SET version_value = security_token_version.version_value + 1;
