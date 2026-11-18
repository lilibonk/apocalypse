/**
 * 用户管理页 schema（DynaLayer 渲染与控制器配置）。
 *
 * 端点映射（后端 UserController）：
 * - 多维搜索 + 状态 + 部门树  → search（keyword + status）+ extraSearchKeys（deptId, includeChildren）
 * - 状态字典列                → columns[3] type:'dict' + dictType sys_user_status
 * - 新增/编辑/启停/批量删除   → POST/PUT/DELETE /system/users
 * - 分配角色 / 重置密码       → custom 行操作（由 ./index.tsx 注入原生弹窗）
 */

import { definePageSchema } from '@/components/dyna'

export default definePageSchema({
  key: 'system-user',
  endpoint: '/system/users',
  title: '用户管理',
  description: '系统用户的增删改查、部门筛选、角色分配与密码重置',
  entityName: '用户',
  createPerm: 'system:user:add',
  exportPerm: 'system:user:list',
  exportFileName: 'users.csv',
  importPerm: 'system:user:add',
  importTemplatePath: '/system/users/import-template',
  importTemplateFileName: 'users-template.csv',
  batchDeletePerm: 'system:user:remove',
  search: [
    { name: 'keyword', label: '用户名 / 昵称', type: 'input', placeholder: '用户名 / 昵称' },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      options: [
        { label: '正常', value: '1' },
        { label: '停用', value: '0' },
      ],
    },
  ],
  columns: [
    { key: 'username', title: '用户名', copyable: true, sortable: true },
    { key: 'nickname', title: '昵称' },
    { key: 'deptName', title: '部门' },
    { key: 'status', title: '状态', type: 'dict', dictType: 'sys_user_status' },
    { key: 'createTime', title: '创建时间', type: 'datetime', sortable: true },
  ],
  detail: {
    title: '用户详情',
    description: '账号、归属部门与当前状态',
  },
  form: {
    createTitle: '新增用户',
    editTitle: '编辑用户',
    fields: [
      {
        name: 'username',
        label: '用户名',
        type: 'input',
        required: true,
        maxLength: 64,
        disabledInEdit: true,
      },
      {
        name: 'password',
        label: '密码',
        type: 'password',
        required: true,
        minLength: 8,
        maxLength: 64,
        maxUtf8Bytes: 72,
        hideInEdit: true,
      },
      { name: 'nickname', label: '昵称', type: 'input', maxLength: 64 },
      {
        name: 'status',
        label: '状态',
        type: 'select',
        valueType: 'number',
        hideInCreate: true,
        defaultValue: '1',
        options: [
          { label: '正常', value: '1' },
          { label: '停用', value: '0' },
        ],
      },
    ],
  },
  rowActions: [
    { kind: 'custom', key: 'inspect', label: '查看', icon: 'view', perm: 'system:user:list' },
    { kind: 'edit', perm: 'system:user:edit' },
    {
      kind: 'custom',
      key: 'assign-roles',
      label: '分配角色',
      icon: 'members',
      perm: 'system:user:edit',
    },
    {
      kind: 'custom',
      key: 'reset-password',
      label: '重置密码',
      icon: 'permissions',
      perm: 'system:user:edit',
    },
    {
      kind: 'status-toggle',
      field: 'status',
      onValue: 1,
      offValue: 0,
      perm: 'system:user:edit',
    },
    { kind: 'delete', perm: 'system:user:remove' },
  ],
  deleteNameKey: 'nickname',
})
