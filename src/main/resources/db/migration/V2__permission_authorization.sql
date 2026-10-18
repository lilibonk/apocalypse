-- One maintenance-window cutover. The V1 menu graph is retained as immutable migration evidence.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM sys_menu WHERE perms LIKE 'ROLE\_%' ESCAPE '\'
               OR perms LIKE 'SCOPE\_%' ESCAPE '\') THEN
        RAISE EXCEPTION 'Permission migration blocked: reserved authority prefix';
    END IF;
    IF EXISTS (SELECT perms FROM sys_menu WHERE perms IS NOT NULL AND perms <> ''
               GROUP BY perms HAVING count(DISTINCT coalesce(module_key, '<NULL>')) > 1) THEN
        RAISE EXCEPTION 'Permission migration blocked: conflicting module ownership';
    END IF;
    IF (SELECT count(DISTINCT ROW(parent_id, path, visible, status, module_key, deleted))
        FROM sys_menu WHERE component = 'system/menu/index' AND menu_type = 'M') > 1 THEN
        RAISE EXCEPTION 'Permission migration blocked: ambiguous menu-management navigation';
    END IF;
    IF EXISTS (SELECT 1 FROM sys_menu WHERE perms IN ('system:permission:list', 'system:permission:edit'))
       OR EXISTS (SELECT 1 FROM sys_menu WHERE component = 'system/permission/index') THEN
        RAISE EXCEPTION 'Permission migration blocked: new permission-management identity already exists';
    END IF;
END $$;

CREATE TABLE sys_permission (
    id BIGINT PRIMARY KEY,
    code VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    description VARCHAR(500),
    module_key VARCHAR(64),
    resource VARCHAR(128) NOT NULL,
    action VARCHAR(128) NOT NULL,
    status SMALLINT NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
    lifecycle VARCHAR(16) NOT NULL CHECK (lifecycle IN ('ACTIVE', 'DEPRECATED', 'LEGACY')),
    declaration_source VARCHAR(256) NOT NULL,
    remark VARCHAR(500),
    create_time TIMESTAMP NOT NULL DEFAULT now(),
    update_time TIMESTAMP NOT NULL DEFAULT now(),
    create_by VARCHAR(64),
    update_by VARCHAR(64),
    version INT NOT NULL DEFAULT 0,
    deleted INT NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    CONSTRAINT ck_sys_permission_code CHECK (code <> '' AND code NOT LIKE 'ROLE\_%' ESCAPE '\'
                                           AND code NOT LIKE 'SCOPE\_%' ESCAPE '\')
);
COMMENT ON TABLE sys_permission IS 'Independent business action catalogue; navigation grants no business authority';
CREATE INDEX idx_sys_permission_module_resource ON sys_permission (module_key, resource);

CREATE TABLE sys_role_permission (
    role_id BIGINT NOT NULL REFERENCES sys_role(id),
    permission_id BIGINT NOT NULL REFERENCES sys_permission(id),
    enabled BOOLEAN NOT NULL DEFAULT true,
    scope_override VARCHAR(24) NOT NULL DEFAULT 'INHERIT_ROLE'
        CHECK (scope_override IN ('INHERIT_ROLE', 'ALL', 'DEPT', 'DEPT_AND_CHILDREN')),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT ck_sys_role_permission_window CHECK
        (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until)
);
CREATE INDEX idx_sys_role_permission_permission ON sys_role_permission(permission_id);
CREATE INDEX idx_sys_role_permission_window ON sys_role_permission(role_id, valid_from, valid_until);

CREATE TABLE sys_role_navigation (
    role_id BIGINT NOT NULL REFERENCES sys_role(id),
    menu_id BIGINT NOT NULL REFERENCES sys_menu(id),
    PRIMARY KEY (role_id, menu_id)
);
CREATE INDEX idx_sys_role_navigation_menu ON sys_role_navigation(menu_id);

CREATE TABLE sys_role_authorization_state (
    role_id BIGINT PRIMARY KEY REFERENCES sys_role(id),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE TABLE sys_permission_catalog_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO sys_permission_catalog_state(id, revision) VALUES (1, 0);
INSERT INTO sys_role_authorization_state(role_id, revision) SELECT id, 0 FROM sys_role;

INSERT INTO sys_permission
    (id, code, name, description, module_key, resource, action, status, lifecycle,
     declaration_source, create_by, update_by)
SELECT min(id), perms, min(menu_name), 'Migrated exact permission identity from V1', min(module_key),
       CASE WHEN strpos(perms, ':') > 0 THEN split_part(perms, ':', 2) ELSE perms END,
       CASE WHEN strpos(perms, ':') > 0 THEN regexp_replace(perms, '^.*:', '') ELSE '' END,
       CASE WHEN bool_or(deleted = 0 AND status = 1) THEN 1 ELSE 0 END,
       'LEGACY', 'V2:sys_menu', 'migration', 'migration'
FROM sys_menu WHERE perms IS NOT NULL AND perms <> '' GROUP BY perms;

-- Explicit executable identities shipped by this build; unknown historical strings stay LEGACY.
CREATE TEMP TABLE migration_permission_declaration(code VARCHAR(128) PRIMARY KEY, module_key VARCHAR(64)) ON COMMIT DROP;
INSERT INTO migration_permission_declaration(code,module_key)
SELECT unnest(ARRAY[
    'system:user:list', 'system:user:add', 'system:user:edit', 'system:user:remove',
    'system:role:list', 'system:role:add', 'system:role:edit', 'system:role:remove',
    'system:menu:list', 'system:menu:add', 'system:menu:edit', 'system:menu:remove',
    'system:dept:list', 'system:dept:add', 'system:dept:edit', 'system:dept:remove',
    'system:dict:list', 'system:dict:add', 'system:dict:edit', 'system:dict:remove',
    'system:config:list', 'system:config:add', 'system:config:edit', 'system:config:remove',
    'system:log:login', 'system:log:oper', 'system:online:list', 'system:online:kick']), NULL;
INSERT INTO migration_permission_declaration(code,module_key)
SELECT unnest(ARRAY[
    'calendar:day:list', 'calendar:day:read', 'calendar:calendar:list', 'calendar:calendar:add',
    'calendar:calendar:edit', 'calendar:calendar:archive', 'calendar:member:list', 'calendar:member:edit',
    'calendar:personal-override:list', 'calendar:personal-override:edit',
    'calendar:managed-override:list', 'calendar:managed-override:edit', 'calendar:managed-override:publish',
    'calendar:event:list', 'calendar:event:read', 'calendar:event:add', 'calendar:event:edit',
    'calendar:event:remove', 'calendar:managed-event:list', 'calendar:managed-event:edit',
    'calendar:managed-event:publish', 'calendar:data-import:list', 'calendar:data-import:upload',
    'calendar:data-import:publish', 'calendar:projection-grant:list', 'calendar:projection-grant:edit']), 'calendar';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM sys_permission p JOIN migration_permission_declaration d ON d.code=p.code
               WHERE p.module_key IS DISTINCT FROM d.module_key) THEN
        RAISE EXCEPTION 'Permission migration blocked: stored identity disagrees with declared module ownership';
    END IF;
END $$;
UPDATE sys_permission p SET lifecycle='ACTIVE', declaration_source='code:' || coalesce(d.module_key,'system')
FROM migration_permission_declaration d WHERE p.code=d.code;
-- A missing old menu must not remove an executable action or implicitly grant it to any role.
-- Newly materialized declared identities start enabled and without role relationships.
INSERT INTO sys_permission
    (id,code,name,description,module_key,resource,action,status,lifecycle,declaration_source,create_by,update_by)
SELECT (SELECT coalesce(max(id),0) FROM sys_permission) + row_number() OVER (ORDER BY d.code),
       d.code,d.code,'Declared action without a V1 menu source',d.module_key,split_part(d.code,':',2),
       regexp_replace(d.code,'^.*:',''),1,'ACTIVE','code:' || coalesce(d.module_key,'system'),'migration','migration'
FROM migration_permission_declaration d WHERE NOT EXISTS (SELECT 1 FROM sys_permission p WHERE p.code=d.code);

INSERT INTO sys_role_permission(role_id, permission_id, enabled)
SELECT rm.role_id, p.id, bool_or(m.deleted = 0 AND m.status = 1)
FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id
JOIN sys_permission p ON p.code = m.perms
GROUP BY rm.role_id, p.id;
INSERT INTO sys_role_navigation(role_id, menu_id)
SELECT rm.role_id, rm.menu_id FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id
WHERE m.menu_type IN ('C', 'M');

CREATE TABLE sys_permission_migration_source (
    permission_id BIGINT NOT NULL REFERENCES sys_permission(id),
    menu_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    source_code VARCHAR(128) NOT NULL,
    source_module_key VARCHAR(64),
    source_status SMALLINT NOT NULL,
    source_deleted INT NOT NULL,
    source_role_status SMALLINT,
    source_role_deleted INT,
    source_role_scope VARCHAR(24),
    source_version VARCHAR(64) NOT NULL,
    source_hash CHAR(64) NOT NULL,
    PRIMARY KEY(permission_id, menu_id, role_id)
);
-- role_id = 0 records a definition source even when no role referenced that menu.
INSERT INTO sys_permission_migration_source
SELECT p.id, m.id, coalesce(rm.role_id, 0), m.perms, m.module_key, m.status, m.deleted,
       r.status,r.deleted,r.data_scope,
       'V1__init.sql', encode(sha256(convert_to(jsonb_build_array(
           m.id, rm.role_id, m.perms, m.module_key, m.status, m.deleted, m.version,
           r.status,r.deleted,r.data_scope,r.version)::text, 'UTF8')), 'hex')
FROM sys_menu m JOIN sys_permission p ON p.code = m.perms
LEFT JOIN sys_role_menu rm ON rm.menu_id = m.id
LEFT JOIN sys_role r ON r.id=rm.role_id;

INSERT INTO sys_permission_migration_source
SELECT p.id,0,0,p.code,p.module_key,p.status,p.deleted,NULL,NULL,NULL,'V2:registered-action',
       encode(sha256(convert_to(jsonb_build_array(p.code,p.module_key,p.status)::text,'UTF8')),'hex')
FROM sys_permission p WHERE NOT EXISTS (SELECT 1 FROM sys_menu m WHERE m.perms=p.code);

-- New management identities inherit each role's own menu-management grant, including pauses.
INSERT INTO sys_permission
    (id, code, name, description, module_key, resource, action, status, lifecycle,
     declaration_source, create_by, update_by)
SELECT (SELECT coalesce(max(id), 0) FROM sys_permission) + row_number() OVER (ORDER BY code),
       code, name, 'Independent permission catalogue management', NULL, 'permission', action,
       coalesce((SELECT status FROM sys_permission WHERE code = source_code), 1),
       'ACTIVE', 'code:system', 'migration', 'migration'
FROM (VALUES ('system:permission:list', '权限目录查询', 'list', 'system:menu:list'),
             ('system:permission:edit', '权限目录维护', 'edit', 'system:menu:edit'))
     AS additions(code, name, action, source_code);
INSERT INTO sys_role_permission(role_id, permission_id, enabled, scope_override)
SELECT rp.role_id, target.id, rp.enabled, rp.scope_override
FROM sys_role_permission rp JOIN sys_permission source ON source.id = rp.permission_id
JOIN sys_permission target ON target.code = CASE source.code
    WHEN 'system:menu:list' THEN 'system:permission:list'
    WHEN 'system:menu:edit' THEN 'system:permission:edit' END;

INSERT INTO sys_permission_migration_source
SELECT target.id, evidence.menu_id, evidence.role_id, evidence.source_code,
       evidence.source_module_key, evidence.source_status, evidence.source_deleted,
       evidence.source_role_status,evidence.source_role_deleted,evidence.source_role_scope,
       'V2:management-delegation', evidence.source_hash
FROM sys_permission_migration_source evidence
JOIN sys_permission source ON source.id = evidence.permission_id
JOIN sys_permission target ON target.code = CASE source.code
    WHEN 'system:menu:list' THEN 'system:permission:list'
    WHEN 'system:menu:edit' THEN 'system:permission:edit' END;

INSERT INTO sys_menu
    (id, parent_id, menu_name, menu_type, path, component, icon, sort, visible, status,
     deleted, module_key, create_by, update_by)
SELECT (SELECT max(id) + 1 FROM sys_menu), parent_id, '权限目录', 'M', 'system/permission',
       'system/permission/index', 'key-round', sort + 1, visible, status,
       deleted, module_key, 'migration', 'migration'
FROM sys_menu WHERE component = 'system/menu/index' AND menu_type = 'M' ORDER BY id LIMIT 1;
INSERT INTO sys_role_navigation(role_id, menu_id)
SELECT DISTINCT old.role_id, added.id
FROM sys_role_menu old JOIN sys_menu origin ON origin.id = old.menu_id
JOIN sys_role_permission grant_row ON grant_row.role_id = old.role_id
JOIN sys_permission p ON p.id = grant_row.permission_id AND p.code = 'system:menu:list'
CROSS JOIN sys_menu added
WHERE origin.component = 'system/menu/index' AND origin.menu_type = 'M'
  AND added.component = 'system/permission/index';

CREATE TABLE sys_authorization_audit (
    id BIGINT PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    occurred_at TIMESTAMP NOT NULL,
    actor_id BIGINT,
    subject_type VARCHAR(32) NOT NULL,
    subject_id BIGINT NOT NULL,
    before_revision BIGINT NOT NULL,
    after_revision BIGINT NOT NULL,
    before_configuration TEXT NOT NULL,
    after_configuration TEXT NOT NULL,
    diff_hash CHAR(64) NOT NULL,
    request_id VARCHAR(128)
);
CREATE INDEX idx_sys_authorization_audit_time ON sys_authorization_audit(occurred_at);
CREATE INDEX idx_sys_authorization_audit_subject
    ON sys_authorization_audit(subject_type, subject_id, occurred_at);
COMMENT ON TABLE sys_authorization_audit IS 'Append-only complete authorization configuration audit';
COMMENT ON TABLE sys_role_menu IS 'Read-only V1 migration provenance; not a runtime authorization source';
