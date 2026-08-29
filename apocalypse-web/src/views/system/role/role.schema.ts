/**
 * 角色管理页 schema（DynaLayer 渲染）。
 *
 * 功能映射：
 * - 关键词搜索        → search[0]（GET /system/roles/page?keyword=）
 * - 状态字典列        → columns[3] type:'dict' + dictType sys_user_status
 * - 新增/编辑         → form（status 仅编辑态：switch + valueType number 提交 1/0）
 * - 启用/禁用         → rowActions status-toggle（PUT /system/roles/{id} 传 status）
 * - 删除              → rowActions delete（AlertDialog 确认，逻辑删除）
 * - 菜单授权/分配用户 → rowActions custom（handler 由 ./index.tsx 经 DynaPage customActions 注入）
 */

import { definePageSchema } from '@/components/dyna'

export default definePageSchema({
  key: 'system-role',
  endpoint: '/system/roles',
  title: '角色管理',
  description: '系统角色的增删改查与授权',
  entityName: '角色',
  createPerm: 'system:role:add',
  search: [{ name: 'keyword', type: 'input', placeholder: '角色名称 / 标识' }],
  columns: [
    { key: 'roleName', title: '角色名称' },
    { key: 'roleKey', title: '角色标识' },
    { key: 'sort', title: '排序' },
    { key: 'status', title: '状态', type: 'dict', dictType: 'sys_user_status' },
    { key: 'remark', title: '备注' },
  ],
  form: {
    createTitle: '新增角色',
    editTitle: '编辑角色',
    fields: [
      { name: 'roleName', label: '角色名称', type: 'input', required: true, maxLength: 64 },
      { name: 'roleKey', label: '角色标识', type: 'input', required: true, maxLength: 64 },
      { name: 'sort', label: '排序', type: 'number', min: 0, max: 9999 },
      {
        name: 'status',
        label: '状态',
        type: 'switch',
        valueType: 'number',
        hideInCreate: true,
        defaultValue: 1,
      },
      { name: 'remark', label: '备注', type: 'textarea', maxLength: 500 },
    ],
  },
  rowActions: [
    { kind: 'edit', perm: 'system:role:edit' },
    {
      kind: 'status-toggle',
      field: 'status',
      onValue: 1,
      offValue: 0,
      // RoleSaveReq 全量替换语义（roleName/roleKey @NotBlank）：局部 {status} 会被 400 拒绝，须提交整行
      submitRow: true,
      perm: 'system:role:edit',
    },
    { kind: 'delete', perm: 'system:role:remove' },
    { kind: 'custom', key: 'grant-menus', label: '菜单授权', perm: 'system:role:edit' },
    { kind: 'custom', key: 'grant-users', label: '分配用户', perm: 'system:role:edit' },
  ],
  deleteNameKey: 'roleName',
})
