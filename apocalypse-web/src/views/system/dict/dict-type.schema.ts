/**
 * 字典类型页 schema（DynaLayer 渲染，挂在字典管理页「字典类型」页签内）。
 *
 * 端点映射（后端 DictController）：
 * - 关键词搜索 → search[0]（GET /system/dict/types/page?keyword=，匹配类型码/名称）
 * - 新增/编辑  → form（POST /system/dict/types、PUT /system/dict/types/{id}）
 * - 启用/停用  → rowActions status-toggle（PUT /system/dict/types/{id} 传 status）
 * - 删除       → rowActions delete（DELETE /system/dict/types/{id}，逻辑删，级联删数据）
 * 说明：状态用 select + valueType 'number'（提交数字），与 golden sample 用户页同款；
 * switch 在 DynaLayer 提交的是 boolean，后端 status 是 Integer（Jackson 3 不做 boolean→Integer 强转）。
 */

import { definePageSchema } from '@/components/dyna'

export default definePageSchema({
  key: 'system-dict-type',
  endpoint: '/system/dict/types',
  title: '字典类型',
  description: '字典类型的增删改查',
  entityName: '字典类型',
  createPerm: 'system:dict:add',
  search: [{ name: 'keyword', type: 'input', placeholder: '类型码 / 名称' }],
  columns: [
    { key: 'dictType', title: '类型码' },
    { key: 'dictName', title: '字典名称' },
    { key: 'status', title: '状态', type: 'dict', dictType: 'sys_user_status' },
    { key: 'remark', title: '备注' },
  ],
  form: {
    createTitle: '新增字典类型',
    editTitle: '编辑字典类型',
    fields: [
      { name: 'dictType', label: '类型码', type: 'input', required: true, maxLength: 64 },
      { name: 'dictName', label: '字典名称', type: 'input', required: true, maxLength: 64 },
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
      { name: 'remark', label: '备注', type: 'textarea', maxLength: 255 },
    ],
  },
  rowActions: [
    { kind: 'edit', perm: 'system:dict:edit' },
    {
      kind: 'status-toggle',
      field: 'status',
      onValue: 1,
      offValue: 0,
      perm: 'system:dict:edit',
    },
    { kind: 'delete', perm: 'system:dict:remove' },
  ],
  deleteNameKey: 'dictName',
})
