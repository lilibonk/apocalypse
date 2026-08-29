-- V1：RBAC（menu 统一权限树）五表 + 种子数据
-- 说明：主键列统一定义为 bigint 主键（不自增）。MP @TableId(ASSIGN_ID) 由应用层生成雪花 ID，
-- 两种用法（数据库序列 / 应用雪花）均可兼容，一致性由应用保证。
-- 权限模型：目录/菜单/按钮统一收进 sys_menu 一棵树，角色挂菜单（sys_role_menu），
-- 接口鉴权取菜单上的 perms 串（如 system:user:list）。

-- ========== 用户表 ==========
CREATE TABLE sys_user (
    id          BIGINT PRIMARY KEY,
    username    VARCHAR(64)  NOT NULL,
    password    VARCHAR(100) NOT NULL,
    nickname    VARCHAR(64),
    status      SMALLINT     NOT NULL DEFAULT 1,
    remark      VARCHAR(500),
    create_time TIMESTAMP    NOT NULL DEFAULT now(),
    update_time TIMESTAMP    NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT          NOT NULL DEFAULT 0,
    deleted     INT          NOT NULL DEFAULT 0
);
COMMENT ON TABLE  sys_user IS '系统用户';
COMMENT ON COLUMN sys_user.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_user.username IS '登录名';
COMMENT ON COLUMN sys_user.password IS '密码密文（BCrypt）';
COMMENT ON COLUMN sys_user.nickname IS '昵称';
COMMENT ON COLUMN sys_user.status IS '状态：1=正常 0=禁用';
COMMENT ON COLUMN sys_user.remark IS '备注';
COMMENT ON COLUMN sys_user.create_time IS '创建时间';
COMMENT ON COLUMN sys_user.update_time IS '更新时间';
COMMENT ON COLUMN sys_user.create_by IS '创建人';
COMMENT ON COLUMN sys_user.update_by IS '更新人';
COMMENT ON COLUMN sys_user.version IS '乐观锁版本';
COMMENT ON COLUMN sys_user.deleted IS '逻辑删除：0=正常 1=已删除';
-- 逻辑删除场景下用户名需可复用，唯一约束带上 deleted
CREATE UNIQUE INDEX uk_sys_user_username ON sys_user (username, deleted);

-- ========== 角色表 ==========
CREATE TABLE sys_role (
    id          BIGINT PRIMARY KEY,
    role_name   VARCHAR(64)  NOT NULL,
    role_key    VARCHAR(64)  NOT NULL,
    sort        INT          NOT NULL DEFAULT 0,
    status      SMALLINT     NOT NULL DEFAULT 1,
    remark      VARCHAR(500),
    create_time TIMESTAMP    NOT NULL DEFAULT now(),
    update_time TIMESTAMP    NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT          NOT NULL DEFAULT 0,
    deleted     INT          NOT NULL DEFAULT 0
);
COMMENT ON TABLE  sys_role IS '系统角色';
COMMENT ON COLUMN sys_role.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_role.role_name IS '角色名称';
COMMENT ON COLUMN sys_role.role_key IS '角色标识（如 admin）';
COMMENT ON COLUMN sys_role.sort IS '显示顺序';
COMMENT ON COLUMN sys_role.status IS '状态：1=正常 0=禁用';
COMMENT ON COLUMN sys_role.remark IS '备注';
COMMENT ON COLUMN sys_role.create_time IS '创建时间';
COMMENT ON COLUMN sys_role.update_time IS '更新时间';
COMMENT ON COLUMN sys_role.create_by IS '创建人';
COMMENT ON COLUMN sys_role.update_by IS '更新人';
COMMENT ON COLUMN sys_role.version IS '乐观锁版本';
COMMENT ON COLUMN sys_role.deleted IS '逻辑删除：0=正常 1=已删除';
CREATE UNIQUE INDEX uk_sys_role_key ON sys_role (role_key, deleted);

-- ========== 用户-角色关联 ==========
CREATE TABLE sys_user_role (
    user_id BIGINT NOT NULL REFERENCES sys_user (id),
    role_id BIGINT NOT NULL REFERENCES sys_role (id),
    PRIMARY KEY (user_id, role_id)
);
COMMENT ON TABLE  sys_user_role IS '用户-角色关联';
COMMENT ON COLUMN sys_user_role.user_id IS '用户 ID';
COMMENT ON COLUMN sys_user_role.role_id IS '角色 ID';
CREATE INDEX idx_sys_user_role_role ON sys_user_role (role_id);

-- ========== 菜单表（统一权限树：目录/菜单/按钮） ==========
CREATE TABLE sys_menu (
    id          BIGINT PRIMARY KEY,
    parent_id   BIGINT      NOT NULL DEFAULT 0,
    menu_name   VARCHAR(64) NOT NULL,
    menu_type   CHAR(1)     NOT NULL,
    path        VARCHAR(128),
    component   VARCHAR(128),
    perms       VARCHAR(128),
    icon        VARCHAR(64),
    sort        INT         NOT NULL DEFAULT 0,
    visible     SMALLINT    NOT NULL DEFAULT 1,
    status      SMALLINT    NOT NULL DEFAULT 1,
    remark      VARCHAR(500),
    create_time TIMESTAMP   NOT NULL DEFAULT now(),
    update_time TIMESTAMP   NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT         NOT NULL DEFAULT 0,
    deleted     INT         NOT NULL DEFAULT 0
);
COMMENT ON TABLE  sys_menu IS '系统菜单（统一权限树）';
COMMENT ON COLUMN sys_menu.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN sys_menu.parent_id IS '父菜单 ID，0=根节点';
COMMENT ON COLUMN sys_menu.menu_name IS '菜单名称';
COMMENT ON COLUMN sys_menu.menu_type IS '类型：C=目录 M=菜单 F=按钮';
COMMENT ON COLUMN sys_menu.path IS '路由地址';
COMMENT ON COLUMN sys_menu.component IS '前端组件路径';
COMMENT ON COLUMN sys_menu.perms IS '权限标识（如 system:user:list）';
COMMENT ON COLUMN sys_menu.icon IS '图标';
COMMENT ON COLUMN sys_menu.sort IS '显示顺序';
COMMENT ON COLUMN sys_menu.visible IS '是否可见：1=显示 0=隐藏';
COMMENT ON COLUMN sys_menu.status IS '状态：1=正常 0=停用';
COMMENT ON COLUMN sys_menu.remark IS '备注';
COMMENT ON COLUMN sys_menu.create_time IS '创建时间';
COMMENT ON COLUMN sys_menu.update_time IS '更新时间';
COMMENT ON COLUMN sys_menu.create_by IS '创建人';
COMMENT ON COLUMN sys_menu.update_by IS '更新人';
COMMENT ON COLUMN sys_menu.version IS '乐观锁版本';
COMMENT ON COLUMN sys_menu.deleted IS '逻辑删除：0=正常 1=已删除';
CREATE INDEX idx_sys_menu_parent ON sys_menu (parent_id);
CREATE INDEX idx_sys_menu_sort ON sys_menu (sort);

-- ========== 角色-菜单关联 ==========
CREATE TABLE sys_role_menu (
    role_id BIGINT NOT NULL REFERENCES sys_role (id),
    menu_id BIGINT NOT NULL REFERENCES sys_menu (id),
    PRIMARY KEY (role_id, menu_id)
);
COMMENT ON TABLE  sys_role_menu IS '角色-菜单关联';
COMMENT ON COLUMN sys_role_menu.role_id IS '角色 ID';
COMMENT ON COLUMN sys_role_menu.menu_id IS '菜单 ID';
CREATE INDEX idx_sys_role_menu_menu ON sys_role_menu (menu_id);

-- ========== 种子数据 ==========
-- admin / admin123（BCrypt 哈希，由 BCryptPasswordEncoder 生成）
INSERT INTO sys_user (id, username, password, nickname, status, create_by, update_by)
VALUES (1, 'admin', '$2a$10$nmw6yWuMnO40cxRPPAl9cOms0eubpHOjB5QyEfs/6LFEr/Y03yEgS',
        '超级管理员', 1, 'system', 'system');

INSERT INTO sys_role (id, role_name, role_key, sort, status, create_by, update_by)
VALUES (1, '管理员', 'admin', 1, 1, 'system', 'system');

INSERT INTO sys_user_role (user_id, role_id) VALUES (1, 1);

-- 菜单树：系统管理（目录）→ 用户/角色/菜单管理（菜单）→ 用户管理下三个按钮
INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, perms, icon, sort, create_by, update_by)
VALUES (100, 0, '系统管理', 'C', '/system', NULL, NULL, 'setting', 1, 'system', 'system'),
       (101, 100, '用户管理', 'M', 'system/user', 'system/user/index', 'system:user:list', 'user', 1, 'system', 'system'),
       (102, 100, '角色管理', 'M', 'system/role', 'system/role/index', 'system:role:list', 'peoples', 2, 'system', 'system'),
       (103, 100, '菜单管理', 'M', 'system/menu', 'system/menu/index', 'system:menu:list', 'tree-table', 3, 'system', 'system'),
       (104, 101, '用户新增', 'F', NULL, NULL, 'system:user:add', NULL, 1, 'system', 'system'),
       (105, 101, '用户修改', 'F', NULL, NULL, 'system:user:edit', NULL, 2, 'system', 'system'),
       (106, 101, '用户删除', 'F', NULL, NULL, 'system:user:remove', NULL, 3, 'system', 'system');

-- admin 角色授予全部菜单
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, id FROM sys_menu;
