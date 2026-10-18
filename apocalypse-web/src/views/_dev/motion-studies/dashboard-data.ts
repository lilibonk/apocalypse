/** Local demonstration data; these observations never represent production activity. */
export type DashboardRange = '24h' | '7d' | '30d'
export type StudyLanguage = 'zh' | 'en'

export const dashboardRanges: DashboardRange[] = ['24h', '7d', '30d']

export const rangeLabels: Record<DashboardRange, Record<StudyLanguage, string>> = {
  '24h': { zh: '24 小时', en: '24 hours' },
  '7d': { zh: '7 天', en: '7 days' },
  '30d': { zh: '30 天', en: '30 days' },
}

export interface DashboardSnapshot {
  logins: number[]
  members: number
  operations: number
  failedOperations: number
  growth: number
  distribution: [number, number, number, number]
  axisLabels: [string, string, string, string]
}

export const dashboardSnapshots: Record<DashboardRange, DashboardSnapshot> = {
  '24h': {
    logins: [
      3, 2, 1, 2, 4, 9, 13, 22, 27, 43, 34, 29, 33, 41, 46, 54, 39, 28, 22, 19, 15, 10, 8, 4,
    ],
    members: 86,
    operations: 684,
    failedOperations: 4,
    growth: 12.4,
    distribution: [438, 137, 82, 27],
    axisLabels: ['00:00', '08:00', '16:00', '23:00'],
  },
  '7d': {
    logins: [312, 386, 341, 425, 398, 476, 508],
    members: 214,
    operations: 4321,
    failedOperations: 18,
    growth: 18.6,
    distribution: [2765, 864, 519, 173],
    axisLabels: ['10/12', '10/14', '10/16', '10/18'],
  },
  '30d': {
    logins: [
      188, 214, 205, 254, 286, 249, 298, 312, 283, 325, 348, 312, 365, 328, 352, 389, 374, 416, 398,
      436, 401, 389, 428, 312, 386, 341, 425, 398, 476, 508,
    ],
    members: 518,
    operations: 18420,
    failedOperations: 87,
    growth: 24.8,
    distribution: [11789, 3684, 2210, 737],
    axisLabels: ['09/19', '09/29', '10/09', '10/18'],
  },
}

export const distributionLabels = [
  { zh: '查询与浏览', en: 'Read & browse' },
  { zh: '新增与更新', en: 'Create & update' },
  { zh: '导出与下载', en: 'Export & download' },
  { zh: '管理与配置', en: 'Administration' },
] as const

export const dashboardActivities = [
  {
    id: 'activity-1',
    time: '14:32',
    person: { zh: '周明远', en: 'Mingyuan Zhou' },
    action: { zh: '更新了「运营团队」角色', en: 'Updated the Operations role' },
    category: { zh: '角色管理', en: 'Role management' },
    detail: {
      zh: '调整了运营团队的报表查询与导出权限。变更已经保存，角色内成员将在下次权限刷新后看到更新。',
      en: 'Updated report access and export permissions for Operations. The change is saved and becomes visible when members refresh their permissions.',
    },
    kind: 'role',
  },
  {
    id: 'activity-2',
    time: '14:18',
    person: { zh: '林可', en: 'Ke Lin' },
    action: { zh: '导出了本周操作记录', en: 'Exported this week’s activity' },
    category: { zh: '操作日志', en: 'Activity log' },
    detail: {
      zh: '导出范围为 2026 年 10 月 12 日至 18 日。此条记录用于展示操作留痕，不包含真实人员或生产数据。',
      en: 'The export covers October 12–18, 2026. This entry illustrates an audit trail and contains no production data or real people.',
    },
    kind: 'export',
  },
  {
    id: 'activity-3',
    time: '13:56',
    person: { zh: '陈语', en: 'Yu Chen' },
    action: { zh: '完成了工作台登录', en: 'Signed in to the workspace' },
    category: { zh: '登录记录', en: 'Sign-in activity' },
    detail: {
      zh: '通过浏览器登录工作台。登录校验通过，本次会话已记录在示例活动列表中。',
      en: 'Signed in through a browser. Authentication succeeded and this session appears in the demonstration activity list.',
    },
    kind: 'login',
  },
] as const

export type DashboardActivity = (typeof dashboardActivities)[number]

export const chartDimensions = {
  width: 600,
  height: 230,
  top: 18,
  bottom: 205,
  left: 8,
  right: 590,
}

/** Fixed sample count makes path interpolation continuous across ranges of different lengths. */
export function dashboardChart(values: readonly number[]) {
  const ceiling = Math.ceil(Math.max(...values) / 10) * 10
  const { left, right, top, bottom } = chartDimensions
  const points = Array.from({ length: 48 }, (_, index) => {
    const position = (index / 47) * (values.length - 1)
    const start = Math.floor(position)
    const fraction = position - start
    const value = values[start] + ((values[start + 1] ?? values[start]) - values[start]) * fraction
    return {
      x: left + (index / 47) * (right - left),
      y: bottom - (value / ceiling) * (bottom - top),
    }
  })
  let path = `M${points[0].x},${points[0].y}`
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const current = points[index]
    const before = points[index - 2] ?? previous
    const after = points[index + 1] ?? current
    path += ` C${previous.x + (current.x - before.x) / 6},${previous.y + (current.y - before.y) / 6} ${current.x - (after.x - previous.x) / 6},${current.y - (after.y - previous.y) / 6} ${current.x},${current.y}`
  }
  return {
    path,
    fill: `${path} L${right},${bottom} L${left},${bottom} Z`,
    ceiling,
    end: points[47],
  }
}

export function loginBucketLabel(range: DashboardRange, index: number, language: StudyLanguage) {
  if (range === '24h') return `${String(index).padStart(2, '0')}:00`
  const day = range === '7d' ? index + 12 : index + 19
  const month = range === '7d' || day > 30 ? 10 : 9
  const date = day > 30 ? day - 30 : day
  return language === 'zh' ? `${month} 月 ${date} 日` : `${month}/${date}`
}
