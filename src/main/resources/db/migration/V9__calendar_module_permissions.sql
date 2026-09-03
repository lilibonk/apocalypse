-- V9：模块归属与 Calendar 菜单/权限。
-- NULL module_key 表示核心能力；未知非空模块由服务端 capability registry fail-closed。

ALTER TABLE sys_menu ADD COLUMN module_key VARCHAR(64);
ALTER TABLE sys_menu ADD CONSTRAINT ck_sys_menu_module_key
    CHECK (module_key IS NULL OR module_key ~ '^[a-z][a-z0-9-]{0,63}$');
CREATE INDEX idx_sys_menu_module_key
    ON sys_menu (module_key) WHERE module_key IS NOT NULL AND deleted = 0;
COMMENT ON COLUMN sys_menu.module_key IS '编译期业务能力稳定键；NULL=核心能力，calendar=万年历模块';

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

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, m.id
FROM sys_menu m
WHERE m.id BETWEEN 200 AND 226
  AND NOT EXISTS (
      SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = 1 AND rm.menu_id = m.id
  );
