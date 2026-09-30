import type { AppI18nModule } from '@/i18n/module-loader'

const systemI18n = {
  namespace: 'system',
  resources: {
    zh: {
      dataScope: {
        label: '数据范围',
        ALL: '全部部门',
        DEPT: '本部门',
        DEPT_AND_CHILDREN: '本部门及下级部门',
        help: '数据范围只作用于此角色实际授予的操作。',
        unchanged: '保留当前数据范围',
      },
      user: {
        department: '部门',
        createDepartmentHelp: '受限范围新增用户必须选择有效部门；全局管理范围可不指定。',
        editDepartmentHelp: '只列出本次编辑操作允许的有效部门。不指定时保留原部门。',
        unassigned: '不指定部门',
        unchanged: '保留原部门',
        currentUnavailable: '原部门：{{name}}（保留原值）',
        optionsLoading: '正在加载可选择的部门…',
        optionsFailed: '部门选项加载失败，暂不能保存。',
        optionsEmpty: '当前操作没有可选择的有效部门；这不代表可以创建未挂部门的用户。',
        retryOptions: '重新加载部门选项',
        passwordHelp: '至少 8 个字符；包含大写、小写字母、数字和符号，UTF-8 编码不超过 72 字节。',
      },
    },
    en: {
      dataScope: {
        label: 'Data scope',
        ALL: 'All departments',
        DEPT: 'Own department',
        DEPT_AND_CHILDREN: 'Own department and descendants',
        help: 'The scope applies only to operations actually granted by this role.',
        unchanged: 'Keep current data scope',
      },
      user: {
        department: 'Department',
        createDepartmentHelp:
          'A restricted scope must select a valid department. A global management scope may leave it unspecified.',
        editDepartmentHelp:
          'Only valid departments allowed for this update are listed. Leave unspecified to keep the current department.',
        unassigned: 'Unspecified department',
        unchanged: 'Keep current department',
        currentUnavailable: 'Current department: {{name}} (keep unchanged)',
        optionsLoading: 'Loading available departments…',
        optionsFailed: 'Could not load department choices. Saving is unavailable.',
        optionsEmpty:
          'No valid departments are available for this operation. This does not authorize creating an unassigned user.',
        retryOptions: 'Reload department choices',
        passwordHelp:
          'At least 8 characters with uppercase, lowercase, a digit and a symbol; at most 72 UTF-8 bytes.',
      },
    },
  },
} satisfies AppI18nModule

export default systemI18n
