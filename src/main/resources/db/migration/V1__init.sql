-- 首版初始基线：仅支持空数据库安装，旧开发数据库须重建。
-- 本版本冻结后仅新增 V2 起的迁移，不再重写已应用的 V1。
-- Flyway 是唯一 DDL 所有者；Calendar 默认关闭仍保留 Schema，退役 Order 保留兼容表。
-- 主键由应用生成雪花 ID；日志为只追加表，event_id 唯一保证重投幂等。

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
    deleted     INT          NOT NULL DEFAULT 0,
    dept_id     BIGINT,
    CONSTRAINT ck_sys_user_status CHECK (status IN (0, 1)),
    CONSTRAINT ck_sys_user_deleted CHECK (deleted IN (0, 1))
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
CREATE UNIQUE INDEX uk_sys_user_username ON sys_user (username) WHERE deleted = 0;

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
    deleted     INT          NOT NULL DEFAULT 0,
    data_scope  VARCHAR(24) NOT NULL DEFAULT 'DEPT',
    CONSTRAINT ck_sys_role_data_scope
        CHECK (data_scope IN ('ALL', 'DEPT', 'DEPT_AND_CHILDREN')),
    CONSTRAINT ck_sys_role_status CHECK (status IN (0, 1)),
    CONSTRAINT ck_sys_role_deleted CHECK (deleted IN (0, 1))
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
CREATE UNIQUE INDEX uk_sys_role_key ON sys_role (role_key) WHERE deleted = 0;

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
    deleted     INT         NOT NULL DEFAULT 0,
    module_key  VARCHAR(64),
    CONSTRAINT ck_sys_menu_module_key
        CHECK (module_key IS NULL OR module_key ~ '^[a-z][a-z0-9-]{0,63}$'),
    CONSTRAINT ck_sys_menu_type CHECK (menu_type IN ('C', 'M', 'F')),
    CONSTRAINT ck_sys_menu_visible CHECK (visible IN (0, 1)),
    CONSTRAINT ck_sys_menu_status CHECK (status IN (0, 1)),
    CONSTRAINT ck_sys_menu_parent_non_negative CHECK (parent_id >= 0),
    CONSTRAINT ck_sys_menu_deleted CHECK (deleted IN (0, 1))
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


CREATE TABLE order_info (
    id          BIGINT PRIMARY KEY,
    order_no    VARCHAR(32)   NOT NULL,
    user_id     BIGINT        NOT NULL,
    amount      NUMERIC(12,2) NOT NULL,
    status      VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    remark      VARCHAR(255),
    create_time TIMESTAMP     NOT NULL DEFAULT now(),
    update_time TIMESTAMP     NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT           NOT NULL DEFAULT 0,
    deleted     INT           NOT NULL DEFAULT 0,
    CONSTRAINT ck_order_info_amount_positive CHECK (amount > 0),
    CONSTRAINT ck_order_info_status CHECK (status IN ('PENDING', 'CANCELLED')),
    CONSTRAINT ck_order_info_deleted CHECK (deleted IN (0, 1))
);
COMMENT ON TABLE  order_info IS '订单';
COMMENT ON COLUMN order_info.id IS '主键（应用层雪花 ID）';
COMMENT ON COLUMN order_info.order_no IS '订单号';
COMMENT ON COLUMN order_info.user_id IS '买家用户 ID';
COMMENT ON COLUMN order_info.amount IS '订单金额';
COMMENT ON COLUMN order_info.status IS '状态：PENDING=待处理 CANCELLED=已取消';
COMMENT ON COLUMN order_info.remark IS '备注';
COMMENT ON COLUMN order_info.create_time IS '创建时间';
COMMENT ON COLUMN order_info.update_time IS '更新时间';
COMMENT ON COLUMN order_info.create_by IS '创建人';
COMMENT ON COLUMN order_info.update_by IS '更新人';
COMMENT ON COLUMN order_info.version IS '乐观锁版本';
COMMENT ON COLUMN order_info.deleted IS '逻辑删除：0=正常 1=已删除';
CREATE UNIQUE INDEX uk_order_info_order_no ON order_info (order_no);
CREATE INDEX idx_order_info_user_id ON order_info (user_id);

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
    deleted     INT         NOT NULL DEFAULT 0,
    CONSTRAINT ck_sys_dept_status CHECK (status IN (0, 1)),
    CONSTRAINT ck_sys_dept_deleted CHECK (deleted IN (0, 1)),
    CONSTRAINT ck_sys_dept_parent_non_negative CHECK (parent_id >= 0)
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
    deleted     INT         NOT NULL DEFAULT 0,
    CONSTRAINT ck_sys_dict_type_status CHECK (status IN (0, 1)),
    CONSTRAINT ck_sys_dict_type_deleted CHECK (deleted IN (0, 1))
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
CREATE UNIQUE INDEX uk_sys_dict_type_type ON sys_dict_type (dict_type) WHERE deleted = 0;

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
    deleted     INT         NOT NULL DEFAULT 0,
    CONSTRAINT ck_sys_dict_data_status CHECK (status IN (0, 1)),
    CONSTRAINT ck_sys_dict_data_deleted CHECK (deleted IN (0, 1))
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
    deleted      INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_sys_config_deleted CHECK (deleted IN (0, 1))
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
CREATE UNIQUE INDEX uk_sys_config_key ON sys_config (config_key) WHERE deleted = 0;

-- ========== 登录日志表（纯追加，无 version/deleted/update 字段） ==========
CREATE TABLE sys_login_log (
    id         BIGINT PRIMARY KEY,
    username   VARCHAR(64),
    ip         VARCHAR(64),
    user_agent VARCHAR(255),
    success    SMALLINT   NOT NULL DEFAULT 0,
    message    VARCHAR(255),
    login_time TIMESTAMP  NOT NULL DEFAULT now(),
    event_id   UUID NOT NULL,
    CONSTRAINT ck_sys_login_log_success CHECK (success IN (0, 1))
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
    cost_time     BIGINT,
    event_id      UUID NOT NULL,
    CONSTRAINT ck_sys_oper_log_status CHECK (status IN (0, 1))
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


CREATE TABLE security_token_version (
    version_key   VARCHAR(255) PRIMARY KEY,
    version_value BIGINT       NOT NULL,
    CONSTRAINT ck_security_token_version_non_negative CHECK (version_value >= 0)
);

COMMENT ON TABLE security_token_version IS 'JWT 授权与凭证撤销代次（PostgreSQL 持久化真源）';
COMMENT ON COLUMN security_token_version.version_key IS 'authorization:global / authorization:user:<username> / credential:user:<username>';
COMMENT ON COLUMN security_token_version.version_value IS '单调递增撤销代次';

CREATE TABLE cal_calendar (
    id          BIGINT PRIMARY KEY,
    calendar_key VARCHAR(64)  NOT NULL,
    kind        VARCHAR(16)   NOT NULL,
    parent_id   BIGINT        REFERENCES cal_calendar (id) ON DELETE RESTRICT,
    name        VARCHAR(128)  NOT NULL,
    region_code VARCHAR(16)   NOT NULL,
    zone_id     VARCHAR(64)   NOT NULL DEFAULT 'Asia/Shanghai',
    state       VARCHAR(16)   NOT NULL DEFAULT 'ACTIVE',
    remark      VARCHAR(500),
    create_time TIMESTAMP     NOT NULL DEFAULT now(),
    update_time TIMESTAMP     NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT           NOT NULL DEFAULT 0,
    deleted     INT           NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_calendar_key CHECK (calendar_key ~ '^[a-z][a-z0-9-]{0,63}$'),
    CONSTRAINT ck_cal_calendar_kind CHECK (kind IN ('SYSTEM', 'MANAGED')),
    CONSTRAINT ck_cal_calendar_state CHECK (state IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    CONSTRAINT ck_cal_calendar_parent CHECK (
        (kind = 'SYSTEM' AND parent_id IS NULL)
        OR (kind = 'MANAGED' AND parent_id IS NOT NULL)
    ),
    CONSTRAINT ck_cal_calendar_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT ck_cal_calendar_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_calendar_key ON cal_calendar (calendar_key) WHERE deleted = 0;
CREATE UNIQUE INDEX uk_cal_calendar_system_region
    ON cal_calendar (region_code) WHERE deleted = 0 AND kind = 'SYSTEM';
CREATE INDEX idx_cal_calendar_parent_state
    ON cal_calendar (parent_id, state) WHERE deleted = 0;
COMMENT ON TABLE cal_calendar IS 'Calendar 上下文；SYSTEM 根与最多八层 MANAGED 继承树';

-- ========== 系统基线发布 ==========
-- source_import_id 在 cal_data_import 创建后补外键，解决发布结果与来源导入的双向审计引用。
CREATE TABLE cal_baseline_release (
    id                       BIGINT PRIMARY KEY,
    region_code              VARCHAR(16)  NOT NULL,
    release_key              VARCHAR(64)  NOT NULL,
    provider_key             VARCHAR(64)  NOT NULL,
    provider_version         VARCHAR(32)  NOT NULL,
    provider_artifact_sha256 CHAR(64)     NOT NULL,
    holiday_bundle_version   VARCHAR(64)  NOT NULL,
    holiday_bundle_sha256    CHAR(64)     NOT NULL,
    supported_from           DATE         NOT NULL,
    supported_to             DATE         NOT NULL,
    source_manifest_uri      VARCHAR(500) NOT NULL,
    source_import_id         BIGINT,
    content_hash             CHAR(64)     NOT NULL,
    state                    VARCHAR(16)  NOT NULL,
    published_at             TIMESTAMP,
    published_by             VARCHAR(64),
    remark                   VARCHAR(500),
    create_time              TIMESTAMP    NOT NULL DEFAULT now(),
    update_time              TIMESTAMP    NOT NULL DEFAULT now(),
    create_by                VARCHAR(64),
    update_by                VARCHAR(64),
    version                  INT          NOT NULL DEFAULT 0,
    deleted                  INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_baseline_range CHECK (supported_from <= supported_to),
    CONSTRAINT ck_cal_baseline_state CHECK (state IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
    CONSTRAINT ck_cal_baseline_publish_audit CHECK (
        (state = 'DRAFT' AND published_at IS NULL AND published_by IS NULL)
        OR (state IN ('PUBLISHED', 'SUPERSEDED') AND published_at IS NOT NULL AND published_by IS NOT NULL)
    ),
    CONSTRAINT ck_cal_baseline_hashes CHECK (
        provider_artifact_sha256 ~ '^[0-9a-f]{64}$'
        AND holiday_bundle_sha256 ~ '^[0-9a-f]{64}$'
        AND content_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_cal_baseline_deleted CHECK (deleted IN (0, 1)),
    CONSTRAINT uk_cal_baseline_release_key UNIQUE (release_key)
);
CREATE UNIQUE INDEX uk_cal_baseline_current_region
    ON cal_baseline_release (region_code) WHERE deleted = 0 AND state = 'PUBLISHED';
CREATE INDEX idx_cal_baseline_region_state_published
    ON cal_baseline_release (region_code, state, published_at DESC);
COMMENT ON TABLE cal_baseline_release IS '不可变日期算法/节假日资源与稀疏系统校正的版本发布';

CREATE TABLE cal_baseline_correction (
    id               BIGINT PRIMARY KEY,
    release_id       BIGINT       NOT NULL REFERENCES cal_baseline_release (id) ON DELETE RESTRICT,
    local_date       DATE         NOT NULL,
    field_key        VARCHAR(32)  NOT NULL,
    action           VARCHAR(16)  NOT NULL,
    value_json       JSONB,
    source_uri       VARCHAR(500),
    source_import_id BIGINT,
    reason           VARCHAR(500) NOT NULL,
    remark           VARCHAR(500),
    create_time      TIMESTAMP    NOT NULL DEFAULT now(),
    update_time      TIMESTAMP    NOT NULL DEFAULT now(),
    create_by        VARCHAR(64),
    update_by        VARCHAR(64),
    version          INT          NOT NULL DEFAULT 0,
    deleted          INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_baseline_correction_field CHECK (
        field_key IN ('LUNAR_DATE', 'ZODIAC', 'SOLAR_TERM', 'DAY_POLICY', 'DISPLAY_LABEL', 'DISPLAY_NOTE')
    ),
    CONSTRAINT ck_cal_baseline_correction_action CHECK (
        (action = 'SET' AND value_json IS NOT NULL AND value_json <> 'null'::jsonb)
        OR (action = 'CLEAR' AND value_json IS NULL)
    ),
    CONSTRAINT ck_cal_baseline_correction_source CHECK (
        source_uri IS NOT NULL OR source_import_id IS NOT NULL
    ),
    CONSTRAINT ck_cal_baseline_correction_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_baseline_correction_item
    ON cal_baseline_correction (release_id, local_date, field_key) WHERE deleted = 0;
CREATE INDEX idx_cal_baseline_correction_date
    ON cal_baseline_correction (release_id, local_date);

-- ========== 日历成员 ==========
CREATE TABLE cal_calendar_member (
    id          BIGINT PRIMARY KEY,
    calendar_id BIGINT       NOT NULL REFERENCES cal_calendar (id) ON DELETE RESTRICT,
    user_id     BIGINT       NOT NULL,
    role        VARCHAR(16)  NOT NULL,
    state       VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    remark      VARCHAR(500),
    create_time TIMESTAMP    NOT NULL DEFAULT now(),
    update_time TIMESTAMP    NOT NULL DEFAULT now(),
    create_by   VARCHAR(64),
    update_by   VARCHAR(64),
    version     INT          NOT NULL DEFAULT 0,
    deleted     INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_member_role CHECK (role IN ('READER', 'EDITOR', 'PUBLISHER')),
    CONSTRAINT ck_cal_member_state CHECK (state IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT ck_cal_member_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_member_calendar_user
    ON cal_calendar_member (calendar_id, user_id) WHERE deleted = 0;
CREATE INDEX idx_cal_member_user_state
    ON cal_calendar_member (user_id, state, calendar_id) WHERE deleted = 0;

-- ========== 日期字段覆盖 ==========
CREATE TABLE cal_override_revision (
    id                  BIGINT PRIMARY KEY,
    calendar_id         BIGINT       NOT NULL REFERENCES cal_calendar (id) ON DELETE RESTRICT,
    scope_type          VARCHAR(16)  NOT NULL,
    owner_user_id       BIGINT,
    revision_no         INT          NOT NULL,
    state               VARCHAR(16)  NOT NULL,
    baseline_release_id BIGINT       NOT NULL REFERENCES cal_baseline_release (id) ON DELETE RESTRICT,
    source_import_id    BIGINT,
    content_hash        CHAR(64)     NOT NULL,
    published_at        TIMESTAMP,
    published_by        VARCHAR(64),
    withdrawn_at        TIMESTAMP,
    withdrawn_by        VARCHAR(64),
    remark              VARCHAR(500),
    create_time         TIMESTAMP    NOT NULL DEFAULT now(),
    update_time         TIMESTAMP    NOT NULL DEFAULT now(),
    create_by           VARCHAR(64),
    update_by           VARCHAR(64),
    version             INT          NOT NULL DEFAULT 0,
    deleted             INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_override_scope CHECK (
        (scope_type = 'PERSONAL' AND owner_user_id IS NOT NULL)
        OR (scope_type = 'MANAGED' AND owner_user_id IS NULL)
    ),
    CONSTRAINT ck_cal_override_revision_positive CHECK (revision_no >= 1),
    CONSTRAINT ck_cal_override_revision_state CHECK (
        state IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN')
    ),
    CONSTRAINT ck_cal_override_content_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_cal_override_publish_audit CHECK (
        (state = 'DRAFT' AND published_at IS NULL AND published_by IS NULL)
        OR (state IN ('PUBLISHED', 'SUPERSEDED', 'WITHDRAWN') AND published_at IS NOT NULL AND published_by IS NOT NULL)
    ),
    CONSTRAINT ck_cal_override_withdraw_audit CHECK (
        (state = 'WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL)
        OR (state <> 'WITHDRAWN' AND withdrawn_at IS NULL AND withdrawn_by IS NULL)
    ),
    CONSTRAINT ck_cal_override_revision_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_override_revision_no
    ON cal_override_revision (calendar_id, scope_type, COALESCE(owner_user_id, 0), revision_no)
    WHERE deleted = 0;
CREATE UNIQUE INDEX uk_cal_override_draft
    ON cal_override_revision (calendar_id, scope_type, COALESCE(owner_user_id, 0))
    WHERE deleted = 0 AND state = 'DRAFT';
CREATE UNIQUE INDEX uk_cal_override_published
    ON cal_override_revision (calendar_id, scope_type, COALESCE(owner_user_id, 0))
    WHERE deleted = 0 AND state = 'PUBLISHED';
CREATE INDEX idx_cal_override_personal
    ON cal_override_revision (owner_user_id, calendar_id, state)
    WHERE deleted = 0 AND scope_type = 'PERSONAL';

CREATE TABLE cal_day_override (
    id                       BIGINT PRIMARY KEY,
    revision_id              BIGINT       NOT NULL REFERENCES cal_override_revision (id) ON DELETE RESTRICT,
    local_date               DATE         NOT NULL,
    field_key                VARCHAR(32)  NOT NULL,
    action                   VARCHAR(16)  NOT NULL,
    value_json               JSONB,
    underlay_value_json      JSONB        NOT NULL,
    underlay_value_hash      CHAR(64)     NOT NULL,
    underlay_source_type     VARCHAR(32)  NOT NULL,
    underlay_source_key      VARCHAR(128),
    underlay_source_version  VARCHAR(64),
    remark                   VARCHAR(500),
    create_time              TIMESTAMP    NOT NULL DEFAULT now(),
    update_time              TIMESTAMP    NOT NULL DEFAULT now(),
    create_by                VARCHAR(64),
    update_by                VARCHAR(64),
    version                  INT          NOT NULL DEFAULT 0,
    deleted                  INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_day_override_field CHECK (
        field_key IN ('LUNAR_DATE', 'ZODIAC', 'SOLAR_TERM', 'DAY_POLICY', 'DISPLAY_LABEL', 'DISPLAY_NOTE')
    ),
    CONSTRAINT ck_cal_day_override_action CHECK (
        (action = 'SET' AND value_json IS NOT NULL AND value_json <> 'null'::jsonb)
        OR (action IN ('CLEAR', 'INHERIT') AND value_json IS NULL)
    ),
    CONSTRAINT ck_cal_day_override_hash CHECK (underlay_value_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_cal_day_override_source CHECK (
        underlay_source_type IN (
            'SYSTEM_DATASET', 'SYSTEM_CORRECTION', 'MANAGED_OVERRIDE', 'PERSONAL_OVERRIDE', 'NONE'
        )
    ),
    CONSTRAINT ck_cal_day_override_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_day_override_item
    ON cal_day_override (revision_id, local_date, field_key) WHERE deleted = 0;
CREATE INDEX idx_cal_day_override_revision_date
    ON cal_day_override (revision_id, local_date);

CREATE TABLE cal_override_conflict (
    id                     BIGINT PRIMARY KEY,
    override_item_id       BIGINT       NOT NULL REFERENCES cal_day_override (id) ON DELETE RESTRICT,
    trigger_type           VARCHAR(32)  NOT NULL,
    trigger_key            VARCHAR(128) NOT NULL,
    previous_underlay_json JSONB        NOT NULL,
    current_underlay_json  JSONB        NOT NULL,
    previous_hash          CHAR(64)     NOT NULL,
    current_hash           CHAR(64)     NOT NULL,
    state                  VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
    detected_at            TIMESTAMP    NOT NULL,
    resolved_at            TIMESTAMP,
    resolved_by            VARCHAR(64),
    resolution_revision_id BIGINT       REFERENCES cal_override_revision (id) ON DELETE RESTRICT,
    remark                 VARCHAR(500),
    create_time            TIMESTAMP    NOT NULL DEFAULT now(),
    update_time            TIMESTAMP    NOT NULL DEFAULT now(),
    create_by              VARCHAR(64),
    update_by              VARCHAR(64),
    version                INT          NOT NULL DEFAULT 0,
    deleted                INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_conflict_trigger CHECK (
        trigger_type IN ('BASELINE_RELEASE', 'PARENT_MANAGED_REVISION', 'LESS_SPECIFIC_PERSONAL_REVISION')
    ),
    CONSTRAINT ck_cal_conflict_hashes CHECK (
        previous_hash ~ '^[0-9a-f]{64}$'
        AND current_hash ~ '^[0-9a-f]{64}$'
        AND previous_hash <> current_hash
    ),
    CONSTRAINT ck_cal_conflict_state CHECK (state IN ('OPEN', 'KEPT', 'REBASED', 'INHERITED')),
    CONSTRAINT ck_cal_conflict_resolution CHECK (
        (state = 'OPEN' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_revision_id IS NULL)
        OR (state = 'KEPT' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
        OR (state IN ('REBASED', 'INHERITED') AND resolved_at IS NOT NULL
            AND resolved_by IS NOT NULL AND resolution_revision_id IS NOT NULL)
    ),
    CONSTRAINT ck_cal_conflict_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_conflict_trigger
    ON cal_override_conflict (override_item_id, trigger_type, trigger_key) WHERE deleted = 0;
CREATE INDEX idx_cal_conflict_state_detected ON cal_override_conflict (state, detected_at);
CREATE INDEX idx_cal_conflict_item_state ON cal_override_conflict (override_item_id, state);

-- ========== 日程与不可变内容修订 ==========
CREATE TABLE cal_event (
    id            BIGINT PRIMARY KEY,
    calendar_id   BIGINT       NOT NULL REFERENCES cal_calendar (id) ON DELETE RESTRICT,
    event_kind    VARCHAR(16)  NOT NULL,
    owner_user_id BIGINT,
    source_kind   VARCHAR(16)  NOT NULL,
    state         VARCHAR(16)  NOT NULL,
    remark        VARCHAR(500),
    create_time   TIMESTAMP    NOT NULL DEFAULT now(),
    update_time   TIMESTAMP    NOT NULL DEFAULT now(),
    create_by     VARCHAR(64),
    update_by     VARCHAR(64),
    version       INT          NOT NULL DEFAULT 0,
    deleted       INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_event_owner CHECK (
        (event_kind = 'PRIVATE' AND owner_user_id IS NOT NULL AND source_kind = 'USER')
        OR (event_kind = 'MANAGED' AND owner_user_id IS NULL AND source_kind IN ('USER', 'PROJECTION'))
    ),
    CONSTRAINT ck_cal_event_state CHECK (state IN ('ACTIVE', 'WITHDRAWN', 'CANCELLED')),
    CONSTRAINT ck_cal_event_deleted CHECK (deleted IN (0, 1))
);
CREATE INDEX idx_cal_event_private
    ON cal_event (owner_user_id, calendar_id, state)
    WHERE event_kind = 'PRIVATE' AND deleted = 0;
CREATE INDEX idx_cal_event_managed
    ON cal_event (calendar_id, state)
    WHERE event_kind = 'MANAGED' AND deleted = 0;

CREATE TABLE cal_event_revision (
    id                 BIGINT PRIMARY KEY,
    event_id           BIGINT        NOT NULL REFERENCES cal_event (id) ON DELETE RESTRICT,
    revision_no        INT           NOT NULL,
    state              VARCHAR(16)   NOT NULL,
    title              VARCHAR(200)  NOT NULL,
    description        VARCHAR(2000),
    location           VARCHAR(256),
    time_kind          VARCHAR(16)   NOT NULL,
    start_date         DATE,
    end_date_exclusive DATE,
    start_at_utc       TIMESTAMP,
    end_at_utc         TIMESTAMP,
    zone_id            VARCHAR(64),
    content_hash       CHAR(64)      NOT NULL,
    published_at       TIMESTAMP,
    published_by       VARCHAR(64),
    closed_at          TIMESTAMP,
    closed_by          VARCHAR(64),
    remark             VARCHAR(500),
    create_time        TIMESTAMP     NOT NULL DEFAULT now(),
    update_time        TIMESTAMP     NOT NULL DEFAULT now(),
    create_by          VARCHAR(64),
    update_by          VARCHAR(64),
    version            INT           NOT NULL DEFAULT 0,
    deleted            INT           NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_event_revision_no CHECK (revision_no >= 1),
    CONSTRAINT ck_cal_event_revision_state CHECK (
        state IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN', 'CANCELLED')
    ),
    CONSTRAINT ck_cal_event_revision_time CHECK (
        (time_kind = 'ALL_DAY' AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL
            AND start_date < end_date_exclusive AND start_at_utc IS NULL AND end_at_utc IS NULL
            AND zone_id IS NULL)
        OR
        (time_kind = 'TIMED' AND start_date IS NULL AND end_date_exclusive IS NULL
            AND start_at_utc IS NOT NULL AND end_at_utc IS NOT NULL
            AND start_at_utc < end_at_utc AND zone_id IS NOT NULL)
    ),
    CONSTRAINT ck_cal_event_revision_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_cal_event_revision_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_event_revision_no
    ON cal_event_revision (event_id, revision_no) WHERE deleted = 0;
CREATE UNIQUE INDEX uk_cal_event_revision_draft
    ON cal_event_revision (event_id) WHERE deleted = 0 AND state = 'DRAFT';
CREATE UNIQUE INDEX uk_cal_event_revision_published
    ON cal_event_revision (event_id) WHERE deleted = 0 AND state = 'PUBLISHED';
CREATE INDEX idx_cal_event_revision_all_day_range
    ON cal_event_revision (start_date, end_date_exclusive, event_id)
    WHERE state = 'PUBLISHED' AND time_kind = 'ALL_DAY' AND deleted = 0;
CREATE INDEX idx_cal_event_revision_timed_range
    ON cal_event_revision (start_at_utc, end_at_utc, event_id)
    WHERE state = 'PUBLISHED' AND time_kind = 'TIMED' AND deleted = 0;

-- ========== 上游投影授权与来源幂等 ==========
CREATE TABLE cal_projection_grant (
    id            BIGINT PRIMARY KEY,
    calendar_id   BIGINT       NOT NULL REFERENCES cal_calendar (id) ON DELETE RESTRICT,
    source_system VARCHAR(64)  NOT NULL,
    publish_mode  VARCHAR(24)  NOT NULL,
    state         VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    remark        VARCHAR(500),
    create_time   TIMESTAMP    NOT NULL DEFAULT now(),
    update_time   TIMESTAMP    NOT NULL DEFAULT now(),
    create_by     VARCHAR(64),
    update_by     VARCHAR(64),
    version       INT          NOT NULL DEFAULT 0,
    deleted       INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_projection_grant_mode CHECK (publish_mode IN ('DRAFT_ONLY', 'DIRECT_PUBLISH')),
    CONSTRAINT ck_cal_projection_grant_state CHECK (state IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT ck_cal_projection_grant_deleted CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX uk_cal_projection_grant_source
    ON cal_projection_grant (calendar_id, source_system) WHERE deleted = 0;
CREATE INDEX idx_cal_projection_grant_system_state
    ON cal_projection_grant (source_system, state);

-- 该表明确不用逻辑删除：来源键取消后仍永久保留，避免被复用。
CREATE TABLE cal_projection_source (
    id             BIGINT PRIMARY KEY,
    calendar_id    BIGINT       NOT NULL REFERENCES cal_calendar (id) ON DELETE RESTRICT,
    event_id       BIGINT       NOT NULL REFERENCES cal_event (id) ON DELETE RESTRICT,
    source_system  VARCHAR(64)  NOT NULL,
    source_type    VARCHAR(64)  NOT NULL,
    source_key     VARCHAR(128) NOT NULL,
    source_version BIGINT       NOT NULL,
    payload_hash   CHAR(64)     NOT NULL,
    state          VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    remark         VARCHAR(500),
    create_time    TIMESTAMP    NOT NULL DEFAULT now(),
    update_time    TIMESTAMP    NOT NULL DEFAULT now(),
    create_by      VARCHAR(64),
    update_by      VARCHAR(64),
    version        INT          NOT NULL DEFAULT 0,
    CONSTRAINT ck_cal_projection_source_version CHECK (source_version >= 0),
    CONSTRAINT ck_cal_projection_source_hash CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_cal_projection_source_state CHECK (state IN ('ACTIVE', 'CANCELLED')),
    CONSTRAINT uk_cal_projection_source_key UNIQUE (source_system, source_type, source_key),
    CONSTRAINT uk_cal_projection_source_event UNIQUE (event_id)
);
CREATE INDEX idx_cal_projection_source_calendar
    ON cal_projection_source (calendar_id, source_system, state);

-- ========== 离线数据导入审计 ==========
CREATE TABLE cal_data_import (
    id                              BIGINT PRIMARY KEY,
    import_key                      VARCHAR(64)  NOT NULL,
    target_type                     VARCHAR(24)  NOT NULL,
    target_calendar_id              BIGINT       REFERENCES cal_calendar (id) ON DELETE RESTRICT,
    region_code                     VARCHAR(16)  NOT NULL,
    data_year                       INT          NOT NULL,
    source_claim                    VARCHAR(24)  NOT NULL,
    assurance_level                 VARCHAR(32)  NOT NULL,
    document_no                     VARCHAR(128),
    document_title                  VARCHAR(256),
    issuer                          VARCHAR(128),
    document_published_on           DATE,
    source_uri                      VARCHAR(500),
    data_file_name                  VARCHAR(255) NOT NULL,
    data_content_type               VARCHAR(128) NOT NULL,
    data_file_size                  BIGINT       NOT NULL,
    data_file_sha256                CHAR(64)     NOT NULL,
    data_file_bytes                 BYTEA        NOT NULL,
    evidence_file_name              VARCHAR(255),
    evidence_content_type           VARCHAR(128),
    evidence_file_size              BIGINT,
    evidence_file_sha256            CHAR(64),
    evidence_file_bytes             BYTEA,
    normalized_payload              JSONB,
    normalized_payload_hash         CHAR(64),
    validation_report               JSONB,
    diff_report                     JSONB,
    state                           VARCHAR(24)  NOT NULL DEFAULT 'UPLOADED',
    reviewed_at                     TIMESTAMP,
    reviewed_by                     VARCHAR(64),
    review_note                     VARCHAR(500),
    published_at                    TIMESTAMP,
    published_by                    VARCHAR(64),
    published_release_id            BIGINT       REFERENCES cal_baseline_release (id) ON DELETE RESTRICT,
    published_revision_id           BIGINT       REFERENCES cal_override_revision (id) ON DELETE RESTRICT,
    remark                          VARCHAR(500),
    create_time                     TIMESTAMP     NOT NULL DEFAULT now(),
    update_time                     TIMESTAMP     NOT NULL DEFAULT now(),
    create_by                       VARCHAR(64),
    update_by                       VARCHAR(64),
    version                         INT           NOT NULL DEFAULT 0,
    deleted                         INT           NOT NULL DEFAULT 0,
    CONSTRAINT uk_cal_data_import_key UNIQUE (import_key),
    CONSTRAINT ck_cal_data_import_target CHECK (
        (target_type = 'SYSTEM_BASELINE' AND target_calendar_id IS NULL)
        OR (target_type = 'MANAGED_OVERRIDE' AND target_calendar_id IS NOT NULL)
    ),
    CONSTRAINT ck_cal_data_import_year CHECK (data_year BETWEEN 1901 AND 2100),
    CONSTRAINT ck_cal_data_import_source CHECK (
        source_claim IN ('OFFICIAL_NOTICE', 'LOCAL_POLICY')
        AND assurance_level IN ('ONLINE_VERIFIED', 'OFFLINE_DOCUMENT_REVIEWED', 'UNVERIFIED')
        AND (target_type <> 'SYSTEM_BASELINE'
            OR (source_claim = 'OFFICIAL_NOTICE' AND assurance_level <> 'UNVERIFIED'))
    ),
    CONSTRAINT ck_cal_data_import_official_metadata CHECK (
        source_claim <> 'OFFICIAL_NOTICE'
        OR (document_no IS NOT NULL AND document_title IS NOT NULL AND issuer IS NOT NULL
            AND document_published_on IS NOT NULL)
    ),
    CONSTRAINT ck_cal_data_import_data_file CHECK (
        data_file_size BETWEEN 1 AND 2097152
        AND data_file_sha256 ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_cal_data_import_evidence CHECK (
        (evidence_file_bytes IS NULL AND evidence_file_name IS NULL AND evidence_content_type IS NULL
            AND evidence_file_size IS NULL AND evidence_file_sha256 IS NULL)
        OR (evidence_file_bytes IS NOT NULL AND evidence_file_name IS NOT NULL
            AND evidence_content_type IS NOT NULL AND evidence_file_size BETWEEN 1 AND 20971520
            AND evidence_file_sha256 ~ '^[0-9a-f]{64}$')
    ),
    CONSTRAINT ck_cal_data_import_state CHECK (
        state IN ('UPLOADED', 'VALIDATED', 'INVALID', 'REVIEWED', 'PUBLISHED', 'REJECTED')
    ),
    CONSTRAINT ck_cal_data_import_review CHECK (
        state NOT IN ('REVIEWED', 'PUBLISHED') OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    ),
    CONSTRAINT ck_cal_data_import_publish CHECK (
        (state <> 'PUBLISHED' AND published_at IS NULL AND published_by IS NULL
            AND published_release_id IS NULL AND published_revision_id IS NULL)
        OR (state = 'PUBLISHED' AND published_at IS NOT NULL AND published_by IS NOT NULL
            AND ((target_type = 'SYSTEM_BASELINE' AND published_release_id IS NOT NULL
                    AND published_revision_id IS NULL)
                OR (target_type = 'MANAGED_OVERRIDE' AND published_release_id IS NULL
                    AND published_revision_id IS NOT NULL)))
    ),
    CONSTRAINT ck_cal_data_import_deleted CHECK (deleted IN (0, 1)),
    uploader_user_id                BIGINT NOT NULL,
    CONSTRAINT fk_cal_data_import_uploader
        FOREIGN KEY (uploader_user_id) REFERENCES sys_user (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uk_cal_data_import_active_file
    ON cal_data_import (data_file_sha256, target_type, COALESCE(target_calendar_id, 0))
    WHERE deleted = 0 AND state NOT IN ('INVALID', 'REJECTED');
CREATE INDEX idx_cal_data_import_target_state
    ON cal_data_import (target_type, target_calendar_id, state, create_time DESC);

-- 补齐双向审计引用。
ALTER TABLE cal_baseline_release
    ADD CONSTRAINT fk_cal_baseline_release_source_import
    FOREIGN KEY (source_import_id) REFERENCES cal_data_import (id) ON DELETE RESTRICT;
ALTER TABLE cal_baseline_correction
    ADD CONSTRAINT fk_cal_baseline_correction_source_import
    FOREIGN KEY (source_import_id) REFERENCES cal_data_import (id) ON DELETE RESTRICT;
ALTER TABLE cal_override_revision
    ADD CONSTRAINT fk_cal_override_revision_source_import
    FOREIGN KEY (source_import_id) REFERENCES cal_data_import (id) ON DELETE RESTRICT;


-- 审计事件登记由 Flyway 创建，框架自动 DDL 保持关闭。
CREATE TABLE event_publication (
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
CREATE INDEX event_publication_serialized_event_hash_idx
    ON event_publication USING hash (serialized_event);
CREATE INDEX event_publication_by_completion_date_idx
    ON event_publication (completion_date);


CREATE UNIQUE INDEX uk_sys_login_log_event_id ON sys_login_log (event_id);
COMMENT ON COLUMN sys_login_log.event_id IS '领域事件 ID（用于重投幂等）';
CREATE UNIQUE INDEX uk_sys_oper_log_event_id ON sys_oper_log (event_id);
COMMENT ON COLUMN sys_oper_log.event_id IS '领域事件 ID（用于重投幂等）';

CREATE INDEX idx_sys_menu_module_key
    ON sys_menu (module_key) WHERE module_key IS NOT NULL AND deleted = 0;
COMMENT ON COLUMN sys_menu.module_key IS '编译期业务能力稳定键；NULL=核心能力，calendar=万年历模块';
COMMENT ON COLUMN sys_role.data_scope IS 'Operation-specific role scope: ALL / DEPT / DEPT_AND_CHILDREN';
CREATE INDEX idx_cal_data_import_uploader_created
    ON cal_data_import (uploader_user_id, create_time DESC);

-- ========== 首版种子数据 ==========
-- 管理员默认禁用；首次启动通过显式一次性密码启用。
INSERT INTO sys_user (id, username, password, nickname, status, create_by, update_by, version, dept_id)
VALUES (1, 'admin', '{bootstrap-disabled}', '超级管理员', 0,
        'system', 'security-migration', 1, 11);

INSERT INTO sys_role (id, role_name, role_key, sort, status, create_by, update_by, data_scope)
VALUES (1, '管理员', 'admin', 1, 1, 'system', 'system', 'ALL');

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



-- 部门树：1 总公司 → 11 研发部、12 运营部
INSERT INTO sys_dept (id, parent_id, dept_name, leader, phone, sort, status, create_by, update_by)
VALUES (1, 0, '总公司', '管理员', '13800000000', 1, 1, 'system', 'system'),
       (11, 1, '研发部', NULL, NULL, 1, 1, 'system', 'system'),
       (12, 1, '运营部', NULL, NULL, 2, 1, 'system', 'system');


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


INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, perms, icon, sort, create_by, update_by)
VALUES (150, 102, '角色新增', 'F', NULL, NULL, 'system:role:add', NULL, 1, 'system', 'system'),
       (151, 102, '角色修改', 'F', NULL, NULL, 'system:role:edit', NULL, 2, 'system', 'system'),
       (152, 102, '角色删除', 'F', NULL, NULL, 'system:role:remove', NULL, 3, 'system', 'system'),
       (153, 103, '菜单新增', 'F', NULL, NULL, 'system:menu:add', NULL, 1, 'system', 'system'),
       (154, 103, '菜单修改', 'F', NULL, NULL, 'system:menu:edit', NULL, 2, 'system', 'system'),
       (155, 103, '菜单删除', 'F', NULL, NULL, 'system:menu:remove', NULL, 3, 'system', 'system');


-- ========== 通用状态字典（成功/失败，登录与操作日志列渲染用） ==========
INSERT INTO sys_dict_type (id, dict_type, dict_name, status, remark, create_by, update_by)
VALUES (3, 'sys_common_status', '通用状态', 1, '登录/操作日志成败状态', 'system', 'system');

INSERT INTO sys_dict_data (id, dict_type, dict_label, dict_value, sort, status, create_by, update_by)
VALUES (6, 'sys_common_status', '成功', '1', 1, 1, 'system', 'system'),
       (7, 'sys_common_status', '失败', '0', 2, 1, 'system', 'system');

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


-- SYSTEM 根是解析上下文，不代表可编辑业务日历。
INSERT INTO cal_calendar
    (id, calendar_key, kind, parent_id, name, region_code, zone_id, state, create_by, update_by)
VALUES
    (1, 'system-cn', 'SYSTEM', NULL, '中国大陆系统日历', 'CN', 'Asia/Shanghai', 'ACTIVE', 'system', 'system');

-- 首个 PUBLISHED release：holiday_bundle_sha256 是随制品 JSON 的 byte-exact SHA-256；
-- content_hash = SHA-256(providerKey|version|artifactHash|bundleVersion|bundleHash)。
INSERT INTO cal_baseline_release
    (id, region_code, release_key, provider_key, provider_version, provider_artifact_sha256,
     holiday_bundle_version, holiday_bundle_sha256, supported_from, supported_to,
     source_manifest_uri, content_hash, state, published_at, published_by, create_by, update_by)
VALUES
    (1, 'CN', 'CN-2025-2026-R1', 'lunar-java', '1.7.7',
     '0c4c3a827333b3e2fd25b411e9067398f58aeb98b1e828e93ba25ba8b7051659',
     'CN-HOLIDAY-2025-2026-R1',
     'cd44f16910dd3766450bc869e8263fe747590016443c0cb4fd0fbaa5c72d1963',
     DATE '1901-01-01', DATE '2100-12-31',
     'classpath:/calendar/baseline/cn-holidays-2025-2026-r1.json',
     'a10556bb9acc42410dbe74c18cb7aad5d2ea07f1556f2ba94565814a4f230d5a',
     'PUBLISHED', now(), 'system', 'system', 'system');

-- 一个目录 + 八个运行页面；页面节点承载对应 list permission，其余 permission 为按钮节点。
INSERT INTO sys_menu
    (id, parent_id, menu_name, menu_type, path, component, perms, icon, module_key,
     sort, visible, status, create_by, update_by)
VALUES
    (200, 0, '万年历', 'C', '/calendar', NULL, NULL, 'calendar-days', 'calendar',
     3, 1, 1, 'system', 'system'),
    (201, 200, '日历视图', 'M', '/calendar', 'calendar/index', 'calendar:day:list',
     'calendar-days', 'calendar', 1, 1, 1, 'system', 'system'),
    (202, 200, '日历管理', 'M', 'calendar/calendars', 'calendar/calendars/index',
     'calendar:calendar:list', 'calendar-cog', 'calendar', 2, 1, 1, 'system', 'system'),
    (203, 200, '个人日期覆盖', 'M', 'calendar/personal-overrides',
     'calendar/personal-overrides/index', 'calendar:personal-override:list', 'calendar-sync',
     'calendar', 3, 1, 1, 'system', 'system'),
    (204, 200, '业务日期覆盖', 'M', 'calendar/managed-overrides',
     'calendar/managed-overrides/index', 'calendar:managed-override:list', 'calendar-range',
     'calendar', 4, 1, 1, 'system', 'system'),
    (205, 200, '我的日程', 'M', 'calendar/events', 'calendar/events/index',
     'calendar:event:list', 'calendar-clock', 'calendar', 5, 1, 1, 'system', 'system'),
    (206, 200, '业务日程', 'M', 'calendar/managed-events', 'calendar/managed-events/index',
     'calendar:managed-event:list', 'calendar-check', 'calendar', 6, 1, 1, 'system', 'system'),
    (207, 200, '年度数据导入', 'M', 'calendar/imports', 'calendar/imports/index',
     'calendar:data-import:list', 'file-up', 'calendar', 7, 1, 1, 'system', 'system'),
    (208, 200, '投影授权', 'M', 'calendar/projections', 'calendar/projections/index',
     'calendar:projection-grant:list', 'waypoints', 'calendar', 8, 1, 1, 'system', 'system'),
    (209, 201, '读取日期详情', 'F', NULL, NULL, 'calendar:day:read', NULL, 'calendar',
     1, 1, 1, 'system', 'system'),
    (210, 202, '创建托管日历', 'F', NULL, NULL, 'calendar:calendar:add', NULL, 'calendar',
     1, 1, 1, 'system', 'system'),
    (211, 202, '修改托管日历', 'F', NULL, NULL, 'calendar:calendar:edit', NULL, 'calendar',
     2, 1, 1, 'system', 'system'),
    (212, 202, '归档托管日历', 'F', NULL, NULL, 'calendar:calendar:archive', NULL, 'calendar',
     3, 1, 1, 'system', 'system'),
    (213, 202, '读取日历成员', 'F', NULL, NULL, 'calendar:member:list', NULL, 'calendar',
     4, 1, 1, 'system', 'system'),
    (214, 202, '管理日历成员', 'F', NULL, NULL, 'calendar:member:edit', NULL, 'calendar',
     5, 1, 1, 'system', 'system'),
    (215, 203, '编辑个人日期覆盖', 'F', NULL, NULL, 'calendar:personal-override:edit', NULL,
     'calendar', 1, 1, 1, 'system', 'system'),
    (216, 204, '编辑业务日期覆盖', 'F', NULL, NULL, 'calendar:managed-override:edit', NULL,
     'calendar', 1, 1, 1, 'system', 'system'),
    (217, 204, '发布业务日期覆盖', 'F', NULL, NULL, 'calendar:managed-override:publish', NULL,
     'calendar', 2, 1, 1, 'system', 'system'),
    (218, 205, '读取日程详情', 'F', NULL, NULL, 'calendar:event:read', NULL, 'calendar',
     1, 1, 1, 'system', 'system'),
    (219, 205, '新增私人日程', 'F', NULL, NULL, 'calendar:event:add', NULL, 'calendar',
     2, 1, 1, 'system', 'system'),
    (220, 205, '修改私人日程', 'F', NULL, NULL, 'calendar:event:edit', NULL, 'calendar',
     3, 1, 1, 'system', 'system'),
    (221, 205, '删除私人日程', 'F', NULL, NULL, 'calendar:event:remove', NULL, 'calendar',
     4, 1, 1, 'system', 'system'),
    (222, 206, '编辑业务日程', 'F', NULL, NULL, 'calendar:managed-event:edit', NULL, 'calendar',
     1, 1, 1, 'system', 'system'),
    (223, 206, '发布业务日程', 'F', NULL, NULL, 'calendar:managed-event:publish', NULL, 'calendar',
     2, 1, 1, 'system', 'system'),
    (224, 208, '管理投影授权', 'F', NULL, NULL, 'calendar:projection-grant:edit', NULL, 'calendar',
     1, 1, 1, 'system', 'system'),
    (225, 207, '上传年度数据', 'F', NULL, NULL, 'calendar:data-import:upload', NULL, 'calendar',
     1, 1, 1, 'system', 'system'),
    (226, 207, '发布年度数据', 'F', NULL, NULL, 'calendar:data-import:publish', NULL, 'calendar',
     2, 1, 1, 'system', 'system');


-- 内置管理员显式拥有全部种子权限；新建角色仍默认 DEPT。
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, id FROM sys_menu;

INSERT INTO security_token_version (version_key, version_value)
VALUES ('credential:user:admin', 1);
