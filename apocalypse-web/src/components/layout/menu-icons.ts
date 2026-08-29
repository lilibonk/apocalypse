import {
  BookOpen,
  BookOpenText,
  ClipboardList,
  FilePenLine,
  LayoutDashboard,
  ListTree,
  LogIn,
  Monitor,
  MonitorDot,
  Network,
  ScrollText,
  Settings,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'

export const MENU_ICON_NAMES = [
  'dashboard',
  'system',
  'setting',
  'user',
  'role',
  'peoples',
  'menu',
  'tree-table',
  'dept',
  'tree',
  'dict',
  'dictionary',
  'edit',
  'log',
  'logininfor',
  'form',
  'online',
  'monitor',
  'config',
] as const

const ICON_MAP: Record<(typeof MENU_ICON_NAMES)[number], LucideIcon> = {
  dashboard: LayoutDashboard,
  system: Settings,
  setting: Settings,
  user: Users,
  role: ShieldCheck,
  peoples: ShieldCheck,
  menu: BookOpen,
  'tree-table': ListTree,
  dept: Network,
  tree: Network,
  dict: BookOpen,
  dictionary: BookOpenText,
  edit: SlidersHorizontal,
  log: ScrollText,
  logininfor: LogIn,
  form: ClipboardList,
  online: MonitorDot,
  monitor: Monitor,
  config: FilePenLine,
}

export function resolveMenuIcon(name: string | null): LucideIcon {
  const normalizedName = name?.trim().toLowerCase() ?? ''
  return ICON_MAP[normalizedName as keyof typeof ICON_MAP] ?? Shapes
}
