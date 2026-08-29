-- V3：system 系统管理域扩充——部门/字典/参数/登录日志/操作日志 + 菜单种子补齐
-- 说明：
-- 1. 部门树不使用 ancestors 冗余路径列，整树/子树查询走 PostgreSQL WITH RECURSIVE（见 SysDeptMapper）。
-- 2. sys_login_log / sys_oper_log 为纯追加日志表：无 version/deleted/update 审计字段，只插不改。
-- 3. 菜单种子沿用 V1 的 sys_menu 统一权限树（C目录/M菜单/F按钮），role_menu 授权按新菜单 id 精确插入，
--    并用 WHERE NOT EXISTS 防重（V3 会跑在已有 V1 数据的库上）。

-- ========== 部门表 ==========
CREATE TABLE sys_dept (
    id          BIGINT PRIMARY KEY,
    parent_id   BIGINT      NOT NULL DEFAULT 0,
    dept_name   VARCHAR(64) NOT NULL,
    leader      VARCHAR(64),
    phone       VARCHAR(32),
    sort        INT         NOT NULL DEFAULT 0,
    status      SMALLINT    NOT NULL DEFAULT 1,
    remark      VARCHAR(500),
    create_time TIMESTAMP   NOT NULL DEFAULT now(),
    update_time TIMESTAMP   NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT         NOT NULL DEFAULT 0,
    deleted     INT         NOT NULL DEFAULT 0
);
COMMENT ON TABLE  sys_dept IS '系统部门（树形，递归 CTE 查询，无 ancestors 冗余列）';
COMMENT ON COLUMN sys_dept.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_dept.parent_id IS '父部门 ID，0=根节点';
COMMENT ON COLUMN sys_dept.dept_name IS '部门名称';
COMMENT ON COLUMN sys_dept.leader IS '负责人';
COMMENT ON COLUMN sys_dept.phone IS '联系电话';
COMMENT ON COLUMN sys_dept.sort IS '显示顺序';
COMMENT ON COLUMN sys_dept.status IS '状态：1=正常 0=停用';
COMMENT ON COLUMN sys_dept.remark IS '备注';
COMMENT ON COLUMN sys_dept.create_time IS '创建时间';
COMMENT ON COLUMN sys_dept.update_time IS '更新时间';
COMMENT ON COLUMN sys_dept.create_by IS '创建人';
COMMENT ON COLUMN sys_dept.update_by IS '更新人';
COMMENT ON COLUMN sys_dept.version IS '乐观锁版本';
COMMENT ON COLUMN sys_dept.deleted IS '逻辑删除：0=正常 1=已删除';
CREATE INDEX idx_sys_dept_parent ON sys_dept (parent_id);

-- ========== 用户表挂接部门 ==========
ALTER TABLE sys_user ADD COLUMN dept_id BIGINT;
COMMENT ON COLUMN sys_user.dept_id IS '所属部门 ID（sys_dept.id）';
CREATE INDEX idx_sys_user_dept ON sys_user (dept_id);

-- ========== 字典类型表 ==========
CREATE TABLE sys_dict_type (
    id          BIGINT PRIMARY KEY,
    dict_type   VARCHAR(64) NOT NULL,
    dict_name   VARCHAR(64) NOT NULL,
    status      SMALLINT    NOT NULL DEFAULT 1,
    remark      VARCHAR(255),
    create_time TIMESTAMP   NOT NULL DEFAULT now(),
    update_time TIMESTAMP   NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT         NOT NULL DEFAULT 0,
    deleted     INT         NOT NULL DEFAULT 0
);
COMMENT ON TABLE  sys_dict_type IS '字典类型（边界：枚举进代码、运营可改进字典）';
COMMENT ON COLUMN sys_dict_type.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_dict_type.dict_type IS '字典类型标识（如 sys_user_status）';
COMMENT ON COLUMN sys_dict_type.dict_name IS '字典名称';
COMMENT ON COLUMN sys_dict_type.status IS '状态：1=正常 0=停用';
COMMENT ON COLUMN sys_dict_type.remark IS '备注';
COMMENT ON COLUMN sys_dict_type.create_time IS '创建时间';
COMMENT ON COLUMN sys_dict_type.update_time IS '更新时间';
COMMENT ON COLUMN sys_dict_type.create_by IS '创建人';
COMMENT ON COLUMN sys_dict_type.update_by IS '更新人';
COMMENT ON COLUMN sys_dict_type.version IS '乐观锁版本';
COMMENT ON COLUMN sys_dict_type.deleted IS '逻辑删除：0=正常 1=已删除';
-- 逻辑删除场景下类型标识需可复用，唯一约束带上 deleted（同 V1 用户名约定）
CREATE UNIQUE INDEX uk_sys_dict_type_type ON sys_dict_type (dict_type, deleted);

-- ========== 字典数据表 ==========
CREATE TABLE sys_dict_data (
    id          BIGINT PRIMARY KEY,
    dict_type   VARCHAR(64) NOT NULL,
    dict_label  VARCHAR(64) NOT NULL,
    dict_value  VARCHAR(64) NOT NULL,
    sort        INT         NOT NULL DEFAULT 0,
    status      SMALLINT    NOT NULL DEFAULT 1,
    remark      VARCHAR(255),
    create_time TIMESTAMP   NOT NULL DEFAULT now(),
    update_time TIMESTAMP   NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT         NOT NULL DEFAULT 0,
    deleted     INT         NOT NULL DEFAULT 0
);
COMMENT ON TABLE  sys_dict_data IS '字典数据';
COMMENT ON COLUMN sys_dict_data.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_dict_data.dict_type IS '字典类型标识';
COMMENT ON COLUMN sys_dict_data.dict_label IS '展示文本';
COMMENT ON COLUMN sys_dict_data.dict_value IS '实际值';
COMMENT ON COLUMN sys_dict_data.sort IS '显示顺序';
COMMENT ON COLUMN sys_dict_data.status IS '状态：1=正常 0=停用';
COMMENT ON COLUMN sys_dict_data.remark IS '备注';
COMMENT ON COLUMN sys_dict_data.create_time IS '创建时间';
COMMENT ON COLUMN sys_dict_data.update_time IS '更新时间';
COMMENT ON COLUMN sys_dict_data.create_by IS '创建人';
COMMENT ON COLUMN sys_dict_data.update_by IS '更新人';
COMMENT ON COLUMN sys_dict_data.version IS '乐观锁版本';
COMMENT ON COLUMN sys_dict_data.deleted IS '逻辑删除：0=正常 1=已删除';
CREATE INDEX idx_sys_dict_data_type_sort ON sys_dict_data (dict_type, sort);

-- ========== 参数配置表 ==========
CREATE TABLE sys_config (
    id           BIGINT PRIMARY KEY,
    config_key   VARCHAR(64)  NOT NULL,
    config_name  VARCHAR(64)  NOT NULL,
    config_value VARCHAR(512),
    remark       VARCHAR(255),
    create_time  TIMESTAMP    NOT NULL DEFAULT now(),
    update_time  TIMESTAMP    NOT NULL DEFAULT now(),
    create_by    VARCHAR(64),
    update_by    VARCHAR(64),
    version      INT          NOT NULL DEFAULT 0,
    deleted      INT          NOT NULL DEFAULT 0
);
COMMENT ON TABLE  sys_config IS '参数配置（仅业务可调参数入库；技术装配走 application-*.yml）';
COMMENT ON COLUMN sys_config.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_config.config_key IS '参数键';
COMMENT ON COLUMN sys_config.config_name IS '参数名称';
COMMENT ON COLUMN sys_config.config_value IS '参数值';
COMMENT ON COLUMN sys_config.remark IS '备注';
COMMENT ON COLUMN sys_config.create_time IS '创建时间';
COMMENT ON COLUMN sys_config.update_time IS '更新时间';
COMMENT ON COLUMN sys_config.create_by IS '创建人';
COMMENT ON COLUMN sys_config.update_by IS '更新人';
COMMENT ON COLUMN sys_config.version IS '乐观锁版本';
COMMENT ON COLUMN sys_config.deleted IS '逻辑删除：0=正常 1=已删除';
CREATE UNIQUE INDEX uk_sys_config_key ON sys_config (config_key, deleted);

-- ========== 登录日志表（纯追加，无 version/deleted/update 字段） ==========
CREATE TABLE sys_login_log (
    id         BIGINT PRIMARY KEY,
    username   VARCHAR(64),
    ip         VARCHAR(64),
    user_agent VARCHAR(255),
    success    SMALLINT   NOT NULL DEFAULT 0,
    message    VARCHAR(255),
    login_time TIMESTAMP  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  sys_login_log IS '登录日志（事件驱动异步落库，纯追加）';
COMMENT ON COLUMN sys_login_log.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_login_log.username IS '登录名';
COMMENT ON COLUMN sys_login_log.ip IS '登录 IP';
COMMENT ON COLUMN sys_login_log.user_agent IS 'User-Agent';
COMMENT ON COLUMN sys_login_log.success IS '是否成功：1=成功 0=失败';
COMMENT ON COLUMN sys_login_log.message IS '提示信息';
COMMENT ON COLUMN sys_login_log.login_time IS '登录时间';
CREATE INDEX idx_sys_login_log_username ON sys_login_log (username);
CREATE INDEX idx_sys_login_log_time ON sys_login_log (login_time);

-- ========== 操作日志表（纯追加，无 version/deleted/update 字段） ==========
CREATE TABLE sys_oper_log (
    id            BIGINT PRIMARY KEY,
    title         VARCHAR(64),
    business_type VARCHAR(32),
    method        VARCHAR(128),
    oper_name     VARCHAR(64),
    oper_ip       VARCHAR(64),
    oper_param    TEXT,
    oper_result   TEXT,
    status        SMALLINT   NOT NULL DEFAULT 1,
    error_msg     VARCHAR(512),
    oper_time     TIMESTAMP  NOT NULL DEFAULT now(),
    cost_time     BIGINT
);
COMMENT ON TABLE  sys_oper_log IS '操作日志（@OperLog 切面采集，事件驱动异步落库，纯追加）';
COMMENT ON COLUMN sys_oper_log.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_oper_log.title IS '操作模块/标题';
COMMENT ON COLUMN sys_oper_log.business_type IS '业务动作类型（INSERT/UPDATE/DELETE 等）';
COMMENT ON COLUMN sys_oper_log.method IS '全限定方法名';
COMMENT ON COLUMN sys_oper_log.oper_name IS '操作人（匿名记 anonymous）';
COMMENT ON COLUMN sys_oper_log.oper_ip IS '操作 IP';
COMMENT ON COLUMN sys_oper_log.oper_param IS '请求参数 JSON（敏感值已脱敏为 ***）';
COMMENT ON COLUMN sys_oper_log.oper_result IS '返回结果 JSON（截断 1000 字符）';
COMMENT ON COLUMN sys_oper_log.status IS '状态：1=成功 0=失败';
COMMENT ON COLUMN sys_oper_log.error_msg IS '异常信息';
COMMENT ON COLUMN sys_oper_log.oper_time IS '操作时间';
COMMENT ON COLUMN sys_oper_log.cost_time IS '耗时（毫秒）';
CREATE INDEX idx_sys_oper_log_name ON sys_oper_log (oper_name);
CREATE INDEX idx_sys_oper_log_time ON sys_oper_log (oper_time);

-- ========== 种子数据 ==========
-- 部门树：1 总公司 → 11 研发部、12 运营部
INSERT INTO sys_dept (id, parent_id, dept_name, leader, phone, sort, status, create_by, update_by)
VALUES (1, 0, '总公司', '管理员', '13800000000', 1, 1, 'system', 'system'),
       (11, 1, '研发部', NULL, NULL, 1, 1, 'system', 'system'),
       (12, 1, '运营部', NULL, NULL, 2, 1, 'system', 'system');

-- admin 用户挂研发部
UPDATE sys_user SET dept_id = 11 WHERE id = 1;

-- 字典：用户状态 / 用户性别
INSERT INTO sys_dict_type (id, dict_type, dict_name, status, remark, create_by, update_by)
VALUES (1, 'sys_user_status', '用户状态', 1, NULL, 'system', 'system'),
       (2, 'sys_user_sex', '用户性别', 1, NULL, 'system', 'system');

INSERT INTO sys_dict_data (id, dict_type, dict_label, dict_value, sort, status, create_by, update_by)
VALUES (1, 'sys_user_status', '正常', '1', 1, 1, 'system', 'system'),
       (2, 'sys_user_status', '停用', '0', 2, 1, 'system', 'system'),
       (3, 'sys_user_sex', '男', '1', 1, 1, 'system', 'system'),
       (4, 'sys_user_sex', '女', '2', 2, 1, 'system', 'system'),
       (5, 'sys_user_sex', '未知', '0', 3, 1, 'system', 'system');

-- 参数：仅业务可调参数入库（技术装配参数走 application-*.yml，不入本表）
INSERT INTO sys_config (id, config_key, config_name, config_value, remark, create_by, update_by)
VALUES (1, 'demo.site.name', '演示站点名称', 'Apocalypse', '示例参数：演示业务可调参数的配置读取', 'system', 'system'),
       (2, 'demo.feature.enabled', '演示功能开关', 'true', '示例参数：布尔型配置读取', 'system', 'system');

-- 菜单种子补齐：部门/字典/参数挂"系统管理"目录（100）；日志管理独立顶级目录（140）
INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, perms, icon, sort, create_by, update_by)
VALUES (110, 100, '部门管理', 'M', 'system/dept', 'system/dept/index', 'system:dept:list', 'tree', 4, 'system', 'system'),
       (111, 110, '部门新增', 'F', NULL, NULL, 'system:dept:add', NULL, 1, 'system', 'system'),
       (112, 110, '部门修改', 'F', NULL, NULL, 'system:dept:edit', NULL, 2, 'system', 'system'),
       (113, 110, '部门删除', 'F', NULL, NULL, 'system:dept:remove', NULL, 3, 'system', 'system'),
       (120, 100, '字典管理', 'M', 'system/dict', 'system/dict/index', 'system:dict:list', 'dict', 5, 'system', 'system'),
       (121, 120, '字典新增', 'F', NULL, NULL, 'system:dict:add', NULL, 1, 'system', 'system'),
       (122, 120, '字典修改', 'F', NULL, NULL, 'system:dict:edit', NULL, 2, 'system', 'system'),
       (123, 120, '字典删除', 'F', NULL, NULL, 'system:dict:remove', NULL, 3, 'system', 'system'),
       (130, 100, '参数设置', 'M', 'system/config', 'system/config/index', 'system:config:list', 'edit', 6, 'system', 'system'),
       (131, 130, '参数新增', 'F', NULL, NULL, 'system:config:add', NULL, 1, 'system', 'system'),
       (132, 130, '参数修改', 'F', NULL, NULL, 'system:config:edit', NULL, 2, 'system', 'system'),
       (133, 130, '参数删除', 'F', NULL, NULL, 'system:config:remove', NULL, 3, 'system', 'system'),
       (140, 0, '日志管理', 'C', '/log', NULL, NULL, 'log', 2, 'system', 'system'),
       (141, 140, '登录日志', 'M', 'system/log/login', 'system/log/login', 'system:log:login', 'logininfor', 1, 'system', 'system'),
       (142, 140, '操作日志', 'M', 'system/log/oper', 'system/log/oper', 'system:log:oper', 'form', 2, 'system', 'system'),
       (143, 140, '在线用户', 'M', 'system/online', 'system/online/index', 'system:online:list', 'online', 3, 'system', 'system'),
       (144, 143, '强退按钮', 'F', NULL, NULL, 'system:online:kick', NULL, 1, 'system', 'system');

-- admin 角色授予本次新增菜单（V3 跑在已有 V1 数据的库上，WHERE NOT EXISTS 防重保证幂等）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, m.id FROM sys_menu m
WHERE m.id BETWEEN 110 AND 144
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = 1 AND rm.menu_id = m.id);
