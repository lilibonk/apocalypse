-- V5：安全与数据完整性加固。
-- 1. 软删除业务键改为仅约束有效行，允许同名记录反复删除/重建。
-- 2. order 示例域补齐显式 RBAC 权限，admin 默认拥有全部订单权限。
-- 3. 菜单枚举字段增加数据库 CHECK，避免绕过应用写入非法权限树节点。
-- 4. 审计日志以 event_id 去重；事件登记表归 Flyway 管理，避免自动建表抢跑。

DROP INDEX uk_sys_user_username;
CREATE UNIQUE INDEX uk_sys_user_username ON sys_user (username) WHERE deleted = 0;

DROP INDEX uk_sys_role_key;
CREATE UNIQUE INDEX uk_sys_role_key ON sys_role (role_key) WHERE deleted = 0;

DROP INDEX uk_sys_dict_type_type;
CREATE UNIQUE INDEX uk_sys_dict_type_type ON sys_dict_type (dict_type) WHERE deleted = 0;

DROP INDEX uk_sys_config_key;
CREATE UNIQUE INDEX uk_sys_config_key ON sys_config (config_key) WHERE deleted = 0;

ALTER TABLE sys_menu
    ADD CONSTRAINT ck_sys_menu_type CHECK (menu_type IN ('C', 'M', 'F')),
    ADD CONSTRAINT ck_sys_menu_visible CHECK (visible IN (0, 1)),
    ADD CONSTRAINT ck_sys_menu_status CHECK (status IN (0, 1)),
    ADD CONSTRAINT ck_sys_menu_parent_non_negative CHECK (parent_id >= 0);

ALTER TABLE sys_user
    ADD CONSTRAINT ck_sys_user_status CHECK (status IN (0, 1)),
    ADD CONSTRAINT ck_sys_user_deleted CHECK (deleted IN (0, 1));
ALTER TABLE sys_role
    ADD CONSTRAINT ck_sys_role_status CHECK (status IN (0, 1)),
    ADD CONSTRAINT ck_sys_role_deleted CHECK (deleted IN (0, 1));
ALTER TABLE sys_menu
    ADD CONSTRAINT ck_sys_menu_deleted CHECK (deleted IN (0, 1));
ALTER TABLE sys_dept
    ADD CONSTRAINT ck_sys_dept_status CHECK (status IN (0, 1)),
    ADD CONSTRAINT ck_sys_dept_deleted CHECK (deleted IN (0, 1)),
    ADD CONSTRAINT ck_sys_dept_parent_non_negative CHECK (parent_id >= 0);
ALTER TABLE sys_dict_type
    ADD CONSTRAINT ck_sys_dict_type_status CHECK (status IN (0, 1)),
    ADD CONSTRAINT ck_sys_dict_type_deleted CHECK (deleted IN (0, 1));
ALTER TABLE sys_dict_data
    ADD CONSTRAINT ck_sys_dict_data_status CHECK (status IN (0, 1)),
    ADD CONSTRAINT ck_sys_dict_data_deleted CHECK (deleted IN (0, 1));
ALTER TABLE sys_config
    ADD CONSTRAINT ck_sys_config_deleted CHECK (deleted IN (0, 1));
ALTER TABLE sys_login_log
    ADD CONSTRAINT ck_sys_login_log_success CHECK (success IN (0, 1));
ALTER TABLE sys_oper_log
    ADD CONSTRAINT ck_sys_oper_log_status CHECK (status IN (0, 1));
ALTER TABLE order_info
    ADD CONSTRAINT ck_order_info_amount_positive CHECK (amount > 0),
    ADD CONSTRAINT ck_order_info_status CHECK (status IN ('PENDING', 'CANCELLED')),
    ADD CONSTRAINT ck_order_info_deleted CHECK (deleted IN (0, 1));

ALTER TABLE sys_login_log ADD COLUMN event_id UUID;
UPDATE sys_login_log SET event_id = gen_random_uuid() WHERE event_id IS NULL;
ALTER TABLE sys_login_log ALTER COLUMN event_id SET NOT NULL;
CREATE UNIQUE INDEX uk_sys_login_log_event_id ON sys_login_log (event_id);
COMMENT ON COLUMN sys_login_log.event_id IS '领域事件 ID（用于重投幂等）';

ALTER TABLE sys_oper_log ADD COLUMN event_id UUID;
UPDATE sys_oper_log SET event_id = gen_random_uuid() WHERE event_id IS NULL;
ALTER TABLE sys_oper_log ALTER COLUMN event_id SET NOT NULL;
CREATE UNIQUE INDEX uk_sys_oper_log_event_id ON sys_oper_log (event_id);
COMMENT ON COLUMN sys_oper_log.event_id IS '领域事件 ID（用于重投幂等）';

-- Spring Modulith JDBC v2 schema（2.1.x）。后续升级需以新增迁移演进，禁止恢复自动建表。
-- 早期本地环境可能由 Modulith 自动建过同结构表；保留既有记录并接管其后续迁移。
CREATE TABLE IF NOT EXISTS event_publication (
    id                     UUID NOT NULL PRIMARY KEY,
    listener_id            TEXT NOT NULL,
    event_type             TEXT NOT NULL,
    serialized_event       TEXT NOT NULL,
    publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
    completion_date        TIMESTAMP WITH TIME ZONE,
    status                 TEXT,
    completion_attempts    INT,
    last_resubmission_date TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS event_publication_serialized_event_hash_idx
    ON event_publication USING hash (serialized_event);
CREATE INDEX IF NOT EXISTS event_publication_by_completion_date_idx
    ON event_publication (completion_date);

-- order 暂无前端菜单页；隐藏目录仅作为统一权限树中的权限归属节点。
INSERT INTO sys_menu
    (id, parent_id, menu_name, menu_type, path, component, perms, icon, sort, visible, status, create_by, update_by)
VALUES
    (160, 0, '订单权限', 'C', NULL, NULL, NULL, 'shopping-cart', 99, 0, 1, 'system', 'system'),
    (161, 160, '创建自己的订单', 'F', NULL, NULL, 'order:create', NULL, 1, 0, 1, 'system', 'system'),
    (162, 160, '读取自己的订单', 'F', NULL, NULL, 'order:read', NULL, 2, 0, 1, 'system', 'system'),
    (163, 160, '读取任意订单', 'F', NULL, NULL, 'order:read:any', NULL, 3, 0, 1, 'system', 'system'),
    (164, 160, '分页自己的订单', 'F', NULL, NULL, 'order:list', NULL, 4, 0, 1, 'system', 'system'),
    (165, 160, '分页全部订单', 'F', NULL, NULL, 'order:list:any', NULL, 5, 0, 1, 'system', 'system');

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, m.id
FROM sys_menu m
WHERE m.id BETWEEN 160 AND 165
  AND NOT EXISTS (
      SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = 1 AND rm.menu_id = m.id
  );
