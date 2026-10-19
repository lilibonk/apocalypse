import { definePageSchema } from '@/components/dyna'

export default definePageSchema({
  key: 'system-permission',
  endpoint: '/system/permissions',
  listPerm: 'system:permission:list',
  title: '权限目录',
  description: '管理已部署动作的权限定义、显示信息与生命周期。',
  entityName: '权限定义',
  search: [
    { name: 'keyword', label: '名称或权限标识', type: 'input' },
    { name: 'moduleKey', label: '模块', type: 'input' },
    { name: 'resource', label: '资源', type: 'input' },
    {
      name: 'status',
      label: '定义状态',
      type: 'select',
      options: [
        { value: '1', label: '启用' },
        { value: '0', label: '停用' },
      ],
    },
  ],
  columns: [
    { key: 'name', title: '名称' },
    { key: 'code', title: '权限标识' },
    { key: 'moduleKey', title: '模块' },
    { key: 'resource', title: '资源' },
    { key: 'action', title: '动作' },
    {
      key: 'status',
      title: '定义状态',
      options: [
        { value: '1', label: '启用', tone: 'success' },
        { value: '0', label: '停用', tone: 'secondary' },
      ],
    },
    {
      key: 'lifecycle',
      title: '生命周期',
      options: [
        { value: 'ACTIVE', label: '可配置', tone: 'secondary' },
        { value: 'DEPRECATED', label: '已弃用', tone: 'warning' },
        { value: 'LEGACY', label: '历史兼容', tone: 'secondary' },
      ],
    },
  ],
  form: {
    editTitle: '编辑权限定义',
    fields: [
      { name: 'code', label: '权限标识', type: 'input', disabledInEdit: true, span: 2 },
      { name: 'moduleKey', label: '模块', type: 'input', disabledInEdit: true },
      { name: 'declarationSource', label: '声明来源', type: 'input', disabledInEdit: true },
      { name: 'name', label: '名称', type: 'input', required: true, maxLength: 64 },
      { name: 'status', label: '定义状态', type: 'switch', valueType: 'number', defaultValue: 1 },
      {
        name: 'lifecycle',
        label: '生命周期',
        type: 'select',
        required: true,
        options: [
          { value: 'ACTIVE', label: '可配置' },
          { value: 'DEPRECATED', label: '已弃用' },
          { value: 'LEGACY', label: '历史兼容' },
        ],
      },
      { name: 'description', label: '说明', type: 'textarea', maxLength: 500, span: 2 },
    ],
  },
  rowActions: [
    {
      kind: 'custom',
      key: 'permission-details',
      label: '详情',
      icon: 'view',
      perm: 'system:permission:list',
    },
    { kind: 'edit', perm: 'system:permission:edit', requiresAllScope: true },
  ],
  detail: {
    title: '权限定义详情',
    fields: [
      { key: 'name', title: '名称' },
      { key: 'code', title: '权限标识' },
      { key: 'moduleKey', title: '模块' },
      { key: 'resource', title: '资源' },
      { key: 'action', title: '动作' },
      { key: 'description', title: '说明' },
      { key: 'declarationSource', title: '声明来源' },
      { key: 'referenceRoleCount', title: '引用角色数' },
      { key: 'version', title: '版本' },
      { key: 'status', title: '定义状态' },
      { key: 'lifecycle', title: '生命周期' },
      { key: 'supportedScopesDisplay', title: '支持范围' },
      { key: 'registeredDisplay', title: '声明状态' },
    ],
  },
})
