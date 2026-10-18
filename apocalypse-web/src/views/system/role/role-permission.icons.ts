import { FolderOpen, LayoutPanelTop, MousePointer2, type LucideIcon } from 'lucide-react'

import type { RolePermissionNode } from './role-permission.model'

export const permissionNodeIcons: Record<RolePermissionNode['type'], LucideIcon> = {
  C: FolderOpen,
  M: LayoutPanelTop,
  F: MousePointer2,
}
