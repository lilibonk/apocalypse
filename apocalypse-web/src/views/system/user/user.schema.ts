/**
 * 用户管理页 schema（DynaLayer 渲染）——与 _dev/user-handwritten.tsx 手写版互为回归对照。
 *
 * 功能映射（对照手写版）：
 * - 关键词搜索        → search[0]（GET /system/users/page?keyword=）
 * - 状态字典列        → columns[3] type:'dict' + dictType sys_user_status
 * - 新增（用户名/密码/昵称）→ form 字段（password hideInEdit，status hideInCreate）
 * - 编辑（昵称/状态）  → 同一份 form：username disabledInEdit 不提交，status valueType number
 * - 启用/禁用         → rowActions status-toggle（既有端点 PUT /system/users/{id} 传 status）
 * - 删除              → rowActions delete（AlertDialog 确认，逻辑删除）
 */

import { definePageSchema } from '@/components/dyna'

export default definePageSchema({
  key: 'system-user',
  endpoint: '/system/users',
  title: '用户管理',
  description: '系统用户的增删改查',
  entityName: '用户',
  createPerm: 'system:user:add',
  search: [{ name: 'keyword', type: 'input', placeholder: '用户名 / 昵称' }],
  columns: [
    { key: 'username', title: '用户名' },
    { key: 'nickname', title: '昵称' },
    { key: 'deptName', title: '部门' },
    { key: 'status', title: '状态', type: 'dict', dictType: 'sys_user_status' },
    { key: 'createTime', title: '创建时间', type: 'datetime' },
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
    { kind: 'view', perm: 'system:user:list' },
    { kind: 'edit', perm: 'system:user:edit' },
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
