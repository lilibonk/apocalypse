-- V4：角色/菜单管理写权限按钮种子 + admin 授权 + sys_common_status 字典（登录/操作日志成败列用）
-- 说明：
-- 1. 角色管理（102）/ 菜单管理（103）下补 add/edit/remove 按钮（menu_type 'F'），写法对齐 V3 菜单种子；
--    按钮 id 段取 150-155（V1 用 100-106、V3 用 110-144），sort 各自父节点下顺延 1-3。
-- 2. admin 角色授权沿用 V3 的 WHERE NOT EXISTS 防重（V4 会跑在已有 V1/V3 数据的库上）。
-- 3. sys_common_status（成功 1 / 失败 0）供登录日志 success、操作日志 status 列字典渲染；
--    与各域 status 列的 sys_user_status（正常/停用）语义不同，分开建型。

-- ========== 角色管理写权限按钮（parent 102） ==========
INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, perms, icon, sort, create_by, update_by)
VALUES (150, 102, '角色新增', 'F', NULL, NULL, 'system:role:add', NULL, 1, 'system', 'system'),
       (151, 102, '角色修改', 'F', NULL, NULL, 'system:role:edit', NULL, 2, 'system', 'system'),
       (152, 102, '角色删除', 'F', NULL, NULL, 'system:role:remove', NULL, 3, 'system', 'system'),
       (153, 103, '菜单新增', 'F', NULL, NULL, 'system:menu:add', NULL, 1, 'system', 'system'),
       (154, 103, '菜单修改', 'F', NULL, NULL, 'system:menu:edit', NULL, 2, 'system', 'system'),
       (155, 103, '菜单删除', 'F', NULL, NULL, 'system:menu:remove', NULL, 3, 'system', 'system');

-- admin 角色授予本次新增按钮（WHERE NOT EXISTS 防重，对齐 V3）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, m.id FROM sys_menu m
WHERE m.id BETWEEN 150 AND 155
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = 1 AND rm.menu_id = m.id);

-- ========== 通用状态字典（成功/失败，登录与操作日志列渲染用） ==========
INSERT INTO sys_dict_type (id, dict_type, dict_name, status, remark, create_by, update_by)
VALUES (3, 'sys_common_status', '通用状态', 1, '登录/操作日志成败状态', 'system', 'system');

INSERT INTO sys_dict_data (id, dict_type, dict_label, dict_value, sort, status, create_by, update_by)
VALUES (6, 'sys_common_status', '成功', '1', 1, 1, 'system', 'system'),
       (7, 'sys_common_status', '失败', '0', 2, 1, 'system', 'system');
