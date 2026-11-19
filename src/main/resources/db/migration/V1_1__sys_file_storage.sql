-- 通用文件管理基础台账、受控导航菜单与独立业务动作定义

CREATE TABLE sys_file (
    id                BIGINT       PRIMARY KEY,
    storage_key       VARCHAR(255) NOT NULL,
    category          VARCHAR(32)  NOT NULL,
    original_filename VARCHAR(128) NOT NULL,
    content_type      VARCHAR(96)  NOT NULL,
    size_bytes        BIGINT       NOT NULL,
    sha256            CHAR(64)     NOT NULL,
    owner_id          BIGINT       NOT NULL,
    owner_username    VARCHAR(64)  NOT NULL,
    dept_id           BIGINT,
    remark            VARCHAR(255),
    create_time       TIMESTAMP    NOT NULL DEFAULT now(),
    update_time       TIMESTAMP    NOT NULL DEFAULT now(),
    create_by         VARCHAR(64),
    update_by         VARCHAR(64),
    version           INT          NOT NULL DEFAULT 0,
    deleted           INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_sys_file_size CHECK (size_bytes > 0),
    CONSTRAINT ck_sys_file_deleted CHECK (deleted IN (0, 1))
);

COMMENT ON TABLE sys_file IS '通用文件存储台账（记录所有者、所属部门、SHA-256 与逻辑删除状态）';
COMMENT ON COLUMN sys_file.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_file.storage_key IS '存储端口安全键';
COMMENT ON COLUMN sys_file.category IS '业务分类';
COMMENT ON COLUMN sys_file.original_filename IS '净化后的原始文件名';
COMMENT ON COLUMN sys_file.content_type IS '经魔数/结构校验后的 MIME 类型';
COMMENT ON COLUMN sys_file.size_bytes IS '文件字节数';
COMMENT ON COLUMN sys_file.sha256 IS '文件内容 SHA-256 摘要';
COMMENT ON COLUMN sys_file.owner_id IS '上传者用户 ID';
COMMENT ON COLUMN sys_file.owner_username IS '上传者用户名快照';
COMMENT ON COLUMN sys_file.dept_id IS '上传者所属部门 ID（用于部门数据范围隔离）';

CREATE UNIQUE INDEX uk_sys_file_storage_key ON sys_file (storage_key);
CREATE INDEX idx_sys_file_owner_active ON sys_file (owner_id, create_time DESC) WHERE deleted = 0;
CREATE INDEX idx_sys_file_dept_active ON sys_file (dept_id, create_time DESC) WHERE deleted = 0;
CREATE INDEX idx_sys_file_category_active ON sys_file (category, create_time DESC) WHERE deleted = 0;
CREATE INDEX idx_sys_file_time_active ON sys_file (create_time DESC) WHERE deleted = 0;

-- 系统管理目录（100）下新增“文件管理”导航菜单；权限目录保持独立授予。
INSERT INTO sys_menu
    (id, parent_id, menu_name, menu_type, path, component, icon, sort, visible, status,
     deleted, module_key, create_by, update_by)
SELECT (SELECT max(id) + 1 FROM sys_menu), 100, '文件管理', 'M', 'system/file',
       'system/file/index', 'file-up', 7, 1, 1, 0, NULL, 'system', 'system';

INSERT INTO sys_role_navigation (role_id, menu_id)
SELECT 1, id FROM sys_menu WHERE component = 'system/file/index' AND menu_type = 'M' AND deleted = 0;

-- 独立业务权限定义（与 sys_menu 解耦，仅供 @PreAuthorize 与授权目录管理）
INSERT INTO sys_permission
    (id, code, name, description, module_key, resource, action, status, lifecycle,
     declaration_source, create_by, update_by)
SELECT (SELECT coalesce(max(id), 0) FROM sys_permission) + row_number() OVER (ORDER BY code),
       code, name, description, NULL, 'file', action,
       1, 'ACTIVE', 'code:system', 'system', 'system'
FROM (VALUES ('system:file:list',   '文件台账查询', '查看与下载归属范围内上传文件', 'list'),
             ('system:file:upload', '通用文件上传', '上传受控类型文件至存储台账', 'upload'),
             ('system:file:remove', '文件清理删除', '逻辑删除台账并回收物理存储空间', 'remove'))
     AS additions(code, name, description, action);

INSERT INTO sys_role_permission (role_id, permission_id, enabled)
SELECT 1, id, true
FROM sys_permission
WHERE code IN ('system:file:list', 'system:file:upload', 'system:file:remove');
