/**
 * 字典数据页 schema（DynaLayer 渲染，挂在字典管理页「字典数据」页签内）。
 *
 * 端点映射（后端 DictController）：
 * - 类型码过滤 → search[0]（GET /system/dict/data/page?dictType=；
 *   后端 pageData 只认 dictType 参数，无 keyword，故不配置关键词搜索）
 * - 新增/编辑  → form（POST /system/dict/data、PUT /system/dict/data/{id}）
 * - 启用/停用  → rowActions status-toggle（PUT /system/dict/data/{id} 传 status）
 * - 删除       → rowActions delete（DELETE /system/dict/data/{id}，逻辑删）
 * 说明：状态用 select + valueType 'number'（提交数字），与 golden sample 用户页同款；
 * switch 在 DynaLayer 提交的是 boolean，后端 status 是 Integer（Jackson 3 不做 boolean→Integer 强转）。
 */

import { definePageSchema } from '@/components/dyna'

export default definePageSchema({
  key: 'system-dict-data',
  endpoint: '/system/dict/data',
  title: '字典数据',
  description: '字典数据的增删改查',
  entityName: '字典数据',
  createPerm: 'system:dict:add',
  search: [{ name: 'dictType', type: 'input', placeholder: '输入类型码过滤' }],
  columns: [
    { key: 'dictType', title: '类型码' },
    { key: 'dictLabel', title: '字典标签' },
    { key: 'dictValue', title: '字典键值' },
    { key: 'sort', title: '排序' },
    { key: 'status', title: '状态', type: 'dict', dictType: 'sys_user_status' },
    { key: 'remark', title: '备注' },
  ],
  form: {
    createTitle: '新增字典数据',
    editTitle: '编辑字典数据',
    fields: [
      {
        name: 'dictType',
        label: '类型码',
        type: 'input',
        required: true,
        maxLength: 64,
        help: '填写所属字典的类型码（如 sys_user_status）',
      },
      { name: 'dictLabel', label: '字典标签', type: 'input', required: true, maxLength: 64 },
      { name: 'dictValue', label: '字典键值', type: 'input', required: true, maxLength: 64 },
      { name: 'sort', label: '排序', type: 'number' },
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
  deleteNameKey: 'dictLabel',
})
