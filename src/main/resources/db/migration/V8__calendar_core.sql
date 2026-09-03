-- V8：Calendar v1 核心 Schema。
-- 设计事实源：启示录/OPC/Designs/OPC-20260830-calendar-v1-schema.md
-- 所有跨 Calendar 表引用使用 RESTRICT；用户 ID 不建立跨 system 模块数据库外键。

-- ========== 日历上下文 ==========
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
    CONSTRAINT ck_cal_baseline_deleted CHECK (deleted IN (0, 1))
);
ALTER TABLE cal_baseline_release ADD CONSTRAINT uk_cal_baseline_release_key UNIQUE (release_key);
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
    CONSTRAINT ck_cal_data_import_deleted CHECK (deleted IN (0, 1))
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
