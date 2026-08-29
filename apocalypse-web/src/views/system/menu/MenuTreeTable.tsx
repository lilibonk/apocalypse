/**
 * 菜单树表格（页面局部）：DynaTable 无树能力，这里手写缩进 + 展开/折叠。
 * 折叠状态用 collapsed 集合表达（默认全部展开），行在其任一祖先被折叠时隐藏。
 * 类型徽标三色区分：C 目录 default / M 菜单 secondary / F 按钮 outline。
 */

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
import { MenuIcon } from '@/components/layout/MenuIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { MenuNode, MenuType } from './menu.types'

const COLUMN_COUNT = 6

const TYPE_META: Record<MenuType, { label: string; variant: 'default' | 'secondary' | 'outline' }> =
  {
    C: { label: '目录', variant: 'default' },
    M: { label: '菜单', variant: 'secondary' },
    F: { label: '按钮', variant: 'outline' },
  }

interface VisibleRow {
  node: MenuNode
  depth: number
}

function flattenVisible(nodes: MenuNode[], collapsed: Set<string>, depth = 0): VisibleRow[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(collapsed.has(node.id) ? [] : flattenVisible(node.children, collapsed, depth + 1)),
  ])
}

export function MenuTreeTable({
  tree,
  isLoading,
  collapsed,
  onToggle,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  tree: MenuNode[]
  isLoading: boolean
  collapsed: Set<string>
  onToggle: (id: string) => void
  onCreateChild: (node: MenuNode) => void
  onEdit: (node: MenuNode) => void
  onDelete: (node: MenuNode) => void
}) {
  const { t } = useTranslation()
  const rows = flattenVisible(tree, collapsed)

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-64">
              {t('common.菜单层级', { defaultValue: '菜单层级' })}
            </TableHead>
            <TableHead className="min-w-64">
              {t('common.路由定义', { defaultValue: '路由定义' })}
            </TableHead>
            <TableHead>{t('common.权限标识', { defaultValue: '权限标识' })}</TableHead>
            <TableHead className="w-36">
              {t('common.显示与状态', { defaultValue: '显示与状态' })}
            </TableHead>
            <TableHead className="w-16">{t('common.排序', { defaultValue: '排序' })}</TableHead>
            <TableHead className="w-32 text-right">
              {t('common.操作', { defaultValue: '操作' })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, index) => (
              <TableRow key={index}>
                {Array.from({ length: COLUMN_COUNT }).map((__, cell) => (
                  <TableCell key={cell}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="h-32 text-center text-muted-foreground">
                {t('common.暂无数据', { defaultValue: '暂无数据' })}
              </TableCell>
            </TableRow>
          )}
          {rows.map(({ node, depth }) => {
            const isCollapsed = collapsed.has(node.id)
            const hasChildren = node.children.length > 0
            const typeMeta = TYPE_META[node.menuType]
            return (
              <TableRow key={node.id} className="group">
                <TableCell>
                  <div
                    className="flex items-center gap-2"
                    style={{ paddingLeft: `calc(var(--spacing) * ${depth * 5})` }}
                  >
                    {hasChildren ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        aria-label={
                          isCollapsed
                            ? t('common.展开', { defaultValue: '展开' })
                            : t('common.折叠', { defaultValue: '折叠' })
                        }
                        onClick={() => onToggle(node.id)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </Button>
                    ) : (
                      <span className="size-6 shrink-0" aria-hidden />
                    )}
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <MenuIcon name={node.icon} className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{node.menuName}</span>
                        <Badge variant={typeMeta.variant} className="shrink-0">
                          {t(`dyna.${typeMeta.label}`, { defaultValue: typeMeta.label })}
                        </Badge>
                      </div>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {node.icon ?? t('common.无图标', { defaultValue: '无图标' })}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1 font-mono text-xs">
                    <div className="truncate text-foreground">{node.path ?? '-'}</div>
                    <div className="truncate text-muted-foreground">{node.component ?? '-'}</div>
                  </div>
                </TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                  {node.perms ?? '-'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">
                      {node.visible === 0
                        ? t('common.隐藏', { defaultValue: '隐藏' })
                        : t('common.显示', { defaultValue: '显示' })}
                    </Badge>
                    <DictTag type="sys_user_status" value={node.status} />
                  </div>
                </TableCell>
                <TableCell className="font-mono">{node.sort}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {node.menuType !== 'F' && (
                    <Perm perm="system:menu:add">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('common.新增下级', { defaultValue: '新增下级' })}
                            onClick={() => onCreateChild(node)}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('common.新增下级', { defaultValue: '新增下级' })}
                        </TooltipContent>
                      </Tooltip>
                    </Perm>
                  )}
                  <Perm perm="system:menu:edit">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.编辑', { defaultValue: '编辑' })}
                          onClick={() => onEdit(node)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('common.编辑', { defaultValue: '编辑' })}</TooltipContent>
                    </Tooltip>
                  </Perm>
                  <Perm perm="system:menu:remove">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.删除', { defaultValue: '删除' })}
                          onClick={() => onDelete(node)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('common.删除', { defaultValue: '删除' })}</TooltipContent>
                    </Tooltip>
                  </Perm>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
