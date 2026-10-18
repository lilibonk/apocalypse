export type StudyLanguage = 'zh' | 'en'
export type StudyCopy = Record<StudyLanguage, string>
export type PermissionGroupId = 'members' | 'access' | 'calendar'
export type PermissionRoleId = 'administrator' | 'operator' | 'auditor'
export type PermissionAction = 'read' | 'create' | 'update' | 'export'

export interface StudyPermission {
  id: string
  groupId: PermissionGroupId
  label: StudyCopy
  action: PermissionAction
  description: StudyCopy
}

export interface StudyPermissionGroup {
  id: PermissionGroupId
  label: StudyCopy
  description: StudyCopy
}

export interface StudyRole {
  id: PermissionRoleId
  label: StudyCopy
  description: StudyCopy
  permissionIds: readonly string[]
}

export const permissionGroups: readonly StudyPermissionGroup[] = [
  {
    id: 'members',
    label: { zh: '成员管理', en: 'Members' },
    description: { zh: '组织成员与账号资料', en: 'People and account profiles' },
  },
  {
    id: 'access',
    label: { zh: '角色权限', en: 'Access' },
    description: { zh: '角色、菜单与访问配置', en: 'Roles, menus and access rules' },
  },
  {
    id: 'calendar',
    label: { zh: '业务日历', en: 'Calendar' },
    description: { zh: '团队日历与日期安排', en: 'Team calendars and schedules' },
  },
]

export const studyPermissions: readonly StudyPermission[] = [
  {
    id: 'system:user:list',
    groupId: 'members',
    action: 'read',
    label: { zh: '查看成员', en: 'View members' },
    description: {
      zh: '浏览示例组织中的成员列表与资料。',
      en: 'Browse members and profiles in the example organization.',
    },
  },
  {
    id: 'system:user:create',
    groupId: 'members',
    action: 'create',
    label: { zh: '新增成员', en: 'Add members' },
    description: {
      zh: '在示例组织中创建成员账号。',
      en: 'Create member accounts in the example organization.',
    },
  },
  {
    id: 'system:user:update',
    groupId: 'members',
    action: 'update',
    label: { zh: '编辑成员', en: 'Edit members' },
    description: {
      zh: '更新示例成员的账号资料。',
      en: 'Update account profiles for example members.',
    },
  },
  {
    id: 'system:user:export',
    groupId: 'members',
    action: 'export',
    label: { zh: '导出成员', en: 'Export members' },
    description: {
      zh: '导出示例组织的成员资料。',
      en: 'Export member records from the example organization.',
    },
  },
  {
    id: 'system:role:list',
    groupId: 'access',
    action: 'read',
    label: { zh: '查看角色', en: 'View roles' },
    description: {
      zh: '查看示例角色及其授权关系。',
      en: 'Inspect example roles and their permission assignments.',
    },
  },
  {
    id: 'system:role:update',
    groupId: 'access',
    action: 'update',
    label: { zh: '编辑角色', en: 'Edit roles' },
    description: { zh: '更新示例角色的配置。', en: 'Update the configuration of an example role.' },
  },
  {
    id: 'system:menu:list',
    groupId: 'access',
    action: 'read',
    label: { zh: '查看菜单', en: 'View menus' },
    description: {
      zh: '查看示例菜单及其操作权限。',
      en: 'Inspect example menus and action permissions.',
    },
  },
  {
    id: 'system:menu:update',
    groupId: 'access',
    action: 'update',
    label: { zh: '配置菜单', en: 'Configure menus' },
    description: {
      zh: '编辑示例导航菜单的配置。',
      en: 'Edit the configuration of example navigation menus.',
    },
  },
  {
    id: 'calendar:calendar:list',
    groupId: 'calendar',
    action: 'read',
    label: { zh: '查看日历', en: 'View calendars' },
    description: {
      zh: '浏览示例团队日历中的日期安排。',
      en: 'Browse schedules in the example team calendar.',
    },
  },
  {
    id: 'calendar:calendar:create',
    groupId: 'calendar',
    action: 'create',
    label: { zh: '创建日历', en: 'Create calendars' },
    description: {
      zh: '创建用于示例团队的业务日历。',
      en: 'Create a business calendar for the example team.',
    },
  },
  {
    id: 'calendar:calendar:update',
    groupId: 'calendar',
    action: 'update',
    label: { zh: '编辑日历', en: 'Edit calendars' },
    description: {
      zh: '调整示例日历中的日期安排。',
      en: 'Update schedules in the example calendar.',
    },
  },
  {
    id: 'calendar:calendar:export',
    groupId: 'calendar',
    action: 'export',
    label: { zh: '导出日历', en: 'Export calendars' },
    description: {
      zh: '导出示例日历中的日期安排。',
      en: 'Export schedules from the example calendar.',
    },
  },
]

export const permissionRoles: readonly StudyRole[] = [
  {
    id: 'administrator',
    label: { zh: '系统管理员', en: 'Administrator' },
    description: { zh: '管理示例组织的全部资源', en: 'Manage every example resource' },
    permissionIds: studyPermissions.map((permission) => permission.id),
  },
  {
    id: 'operator',
    label: { zh: '团队运营', en: 'Team operator' },
    description: { zh: '维护成员资料与团队日历', en: 'Maintain people and team calendars' },
    permissionIds: [
      'system:user:list',
      'system:user:create',
      'system:user:update',
      'calendar:calendar:list',
      'calendar:calendar:create',
      'calendar:calendar:update',
    ],
  },
  {
    id: 'auditor',
    label: { zh: '只读审计员', en: 'Read-only auditor' },
    description: { zh: '查看配置并导出业务记录', en: 'Inspect settings and export records' },
    permissionIds: [
      'system:user:list',
      'system:user:export',
      'system:role:list',
      'system:menu:list',
      'calendar:calendar:list',
      'calendar:calendar:export',
    ],
  },
]

export interface PermissionStudyState {
  roleId: PermissionRoleId
  groupId: PermissionGroupId | null
  permissionId: string | null
  query: string
}

export const initialPermissionState: PermissionStudyState = {
  roleId: 'administrator',
  groupId: 'members',
  permissionId: null,
  query: '',
}

export function derivePermissionStudy(state: PermissionStudyState) {
  const role = permissionRoles.find((entry) => entry.id === state.roleId) ?? permissionRoles[0]!
  const granted = studyPermissions.filter((permission) =>
    role.permissionIds.includes(permission.id),
  )
  const query = state.query.trim().toLocaleLowerCase()
  const matching = granted.filter((permission) => {
    const group = permissionGroups.find((entry) => entry.id === permission.groupId)!
    return [
      permission.id,
      permission.label.zh,
      permission.label.en,
      group.label.zh,
      group.label.en,
    ].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const groups = permissionGroups
    .map((group) => ({
      ...group,
      permissions: granted.filter((permission) => permission.groupId === group.id),
      matches: matching.filter((permission) => permission.groupId === group.id),
    }))
    .filter((group) => group.permissions.length > 0)
  const requestedGroup = groups.find((group) => group.id === state.groupId)
  const activeGroup = query
    ? state.groupId === null
      ? null
      : ((requestedGroup?.matches.length
          ? requestedGroup
          : groups.find((group) => group.matches.length > 0)) ?? null)
    : (requestedGroup ?? null)
  const activePermissions = activeGroup
    ? query
      ? activeGroup.matches
      : activeGroup.permissions
    : []
  const activePermission =
    activePermissions.find((permission) => permission.id === state.permissionId) ?? null
  const path = activeGroup
    ? [role.label, activeGroup.label, ...(activePermission ? [activePermission.label] : [])]
    : [role.label]

  return {
    role,
    granted,
    matching,
    groups,
    activeGroup,
    activePermissions,
    activePermission,
    path,
    hasQuery: Boolean(query),
  }
}

export function selectPermissionRole(roleId: PermissionRoleId): PermissionStudyState {
  return { ...initialPermissionState, roleId }
}

export function selectPermissionGroup(
  state: PermissionStudyState,
  groupId: PermissionGroupId,
): PermissionStudyState {
  return { ...state, groupId: state.groupId === groupId ? null : groupId, permissionId: null }
}

export function selectStudyPermission(
  state: PermissionStudyState,
  permission: StudyPermission,
): PermissionStudyState {
  return { ...state, groupId: permission.groupId, permissionId: permission.id }
}
