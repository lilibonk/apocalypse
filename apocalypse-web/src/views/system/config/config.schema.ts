/**
 * 参数设置页 schema（DynaLayer 渲染）。
 *
 * 端点映射（后端 ConfigController）：
 * - 关键词搜索 → search[0]（GET /system/configs/page?keyword=，匹配参数键/名称）
 * - 新增/编辑  → form（POST /system/configs、PUT /system/configs/{id}）
 * - 删除       → rowActions delete（DELETE /system/configs/{id}，逻辑删除）
 * 说明：参数无状态位，不配置 status-toggle。
 */

import { definePageSchema } from '@/components/dyna'

export default definePageSchema({
  key: 'system-config',
  endpoint: '/system/configs',
  title: '参数设置',
  description: '系统参数的增删改查',
  entityName: '参数',
  createPerm: 'system:config:add',
  search: [{ name: 'keyword', type: 'input', placeholder: '参数键 / 名称' }],
  columns: [
    { key: 'configKey', title: '参数键' },
    { key: 'configName', title: '参数名称' },
    { key: 'configValue', title: '参数值' },
    { key: 'remark', title: '备注' },
  ],
  form: {
    createTitle: '新增参数',
    editTitle: '编辑参数',
    fields: [
      { name: 'configKey', label: '参数键', type: 'input', required: true, maxLength: 64 },
      { name: 'configName', label: '参数名称', type: 'input', required: true, maxLength: 64 },
      { name: 'configValue', label: '参数值', type: 'textarea', maxLength: 512 },
      { name: 'remark', label: '备注', type: 'textarea', maxLength: 255 },
    ],
  },
  rowActions: [
    { kind: 'edit', perm: 'system:config:edit' },
    { kind: 'delete', perm: 'system:config:remove' },
  ],
  deleteNameKey: 'configName',
})
