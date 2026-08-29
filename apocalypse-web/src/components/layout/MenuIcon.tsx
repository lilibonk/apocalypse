/**
 * 菜单图标：后端 menus.icon 存 lucide 图标名（小写短横线），这里做受控映射。
 * 不在映射表内的名字回落为通用模块图标，避免整棵 lucide 打进 bundle，
 * 也避免未知配置在侧栏里退化成一串难以区分的圆点。
 */

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

const ICON_MAP: Record<string, LucideIcon> = {
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

export function MenuIcon({ name, className }: { name: string | null; className?: string }) {
  const normalizedName = name?.trim().toLowerCase() ?? ''
  const Icon = ICON_MAP[normalizedName] ?? Shapes
  return <Icon className={className ?? 'size-4 shrink-0'} />
}
