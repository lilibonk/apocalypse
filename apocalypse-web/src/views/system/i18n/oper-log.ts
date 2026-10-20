/**
 * Operation-log business types (backend `@OperLog(businessType)` codes). Codes stay interface-only;
 * the table shows these labels and the detail sheet keeps the code as a technical trace.
 * Keys must match across locales.
 */
export const operLogCopy = {
  zh: {
    event: '事件',
    invokedMethod: '调用方法',
    copyFailed: '复制失败，请重试。',
    allRecords: '全部模块 / 操作人',
    filterContext: '当前查询：{{keyword}}。按记录时间浏览，详情保留完整调用信息与结果。',
    other: '其他（{{code}}）',
    unrecorded: '未记录',
    type: {
      INSERT: '新增',
      UPDATE: '修改',
      DELETE: '删除',
      SAVE: '保存',
      GRANT: '授权',
      REVOKE: '撤销授权',
      FORCE: '强制下线',
      EXPORT: '导出',
      UPLOAD: '上传',
      VALIDATE: '校验',
      PUBLISH: '发布',
      ARCHIVE: '归档',
      REVIEW: '审核',
      REJECT: '驳回',
      RESOLVE: '处理完成',
      WITHDRAW: '撤回',
      CANCEL: '取消',
      CREATE_DRAFT: '创建草稿',
      SAVE_DRAFT: '保存草稿',
      DISCARD_DRAFT: '放弃草稿',
    },
  },
  en: {
    event: 'Event',
    invokedMethod: 'Invoked method',
    copyFailed: 'Copy failed. Please try again.',
    allRecords: 'All modules / operators',
    filterContext:
      'Current query: {{keyword}}. Browse by recorded time; details retain the full invocation and result.',
    other: 'Other ({{code}})',
    unrecorded: 'Not recorded',
    type: {
      INSERT: 'Create',
      UPDATE: 'Update',
      DELETE: 'Delete',
      SAVE: 'Save',
      GRANT: 'Grant access',
      REVOKE: 'Revoke access',
      FORCE: 'Force sign-out',
      EXPORT: 'Export',
      UPLOAD: 'Upload',
      VALIDATE: 'Validate',
      PUBLISH: 'Publish',
      ARCHIVE: 'Archive',
      REVIEW: 'Review',
      REJECT: 'Reject',
      RESOLVE: 'Resolve',
      WITHDRAW: 'Withdraw',
      CANCEL: 'Cancel',
      CREATE_DRAFT: 'Create draft',
      SAVE_DRAFT: 'Save draft',
      DISCARD_DRAFT: 'Discard draft',
    },
  },
}

export type OperTypeCode = keyof typeof operLogCopy.zh.type

export function isKnownOperType(code: string): code is OperTypeCode {
  return Object.hasOwn(operLogCopy.zh.type, code)
}
