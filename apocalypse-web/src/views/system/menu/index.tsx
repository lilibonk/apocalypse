/**
 * 菜单管理（手写树页）：菜单树（目录/菜单/按钮）的增删改查。
 *
 * 树形展示 + 上级树选择越出标准 CRUD 模式（DynaTable 无树能力），
 * 按 AGENTS.md §4 逃逸舱原则手写；交互/视觉对齐 golden sample（views/_dev/user-handwritten.tsx）。
 * 后端契约注意点集中在 ./menu.types.ts（响应字段是 type 而非 menuType；visible/status 已随树返回）。
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderTree,
  MousePointerClick,
  PanelTop,
  Plus,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Perm } from '@/components/Perm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { getMenuTree } from './menu.api'
import { ROOT_PARENT_ID, normalizeMenuTreeNode, type MenuNode, type MenuType } from './menu.types'
import { MenuDeleteDialog } from './MenuDeleteDialog'
import { MenuFormDialog, type MenuFormPayload } from './MenuFormDialog'
import { MenuTreeTable } from './MenuTreeTable'

type MenuFilter = 'ALL' | MenuType

function flattenTree(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)])
}

function filterTree(nodes: MenuNode[], query: string, type: MenuFilter): MenuNode[] {
  const keyword = query.trim().toLowerCase()
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query, type)
    const haystack = [node.menuName, node.path, node.component, node.perms, node.icon]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const matchesQuery = !keyword || haystack.includes(keyword)
    const matchesType = type === 'ALL' || node.menuType === type
    if ((matchesQuery && matchesType) || children.length > 0) return [{ ...node, children }]
    return []
  })
}

export default function MenuPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // 折叠集合（默认全部展开）；formPayload 非空即打开新增/编辑对话框
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [formPayload, setFormPayload] = useState<MenuFormPayload | null>(null)
  const [deleting, setDeleting] = useState<MenuNode | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MenuFilter>('ALL')

  const { data, isLoading } = useQuery({
    queryKey: ['system', 'menus', 'tree'],
    queryFn: getMenuTree,
  })
  const tree = useMemo(() => (data ?? []).map(normalizeMenuTreeNode), [data])
  const allNodes = useMemo(() => flattenTree(tree), [tree])
  const filteredTree = useMemo(() => filterTree(tree, query, typeFilter), [tree, query, typeFilter])
  const filteredNodes = useMemo(() => flattenTree(filteredTree), [filteredTree])
  const filtering = query.trim().length > 0 || typeFilter !== 'ALL'
  const effectiveCollapsed = filtering ? new Set<string>() : collapsed
  const typeCounts = useMemo(
    () => ({
      C: allNodes.filter((node) => node.menuType === 'C').length,
      M: allNodes.filter((node) => node.menuType === 'M').length,
      F: allNodes.filter((node) => node.menuType === 'F').length,
    }),
    [allNodes],
  )

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system', 'menus'] })

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const collapseAll = () =>
    setCollapsed(
      new Set(allNodes.filter((node) => node.children.length > 0).map((node) => node.id)),
    )

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t('common.菜单管理', { defaultValue: '菜单管理' })}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('common.系统菜单（目录 / 菜单 / 按钮）的维护', {
              defaultValue: '系统菜单（目录 / 菜单 / 按钮）的维护',
            })}
          </p>
        </div>
        <Perm perm="system:menu:add">
          <Button
            size="sm"
            onClick={() => setFormPayload({ mode: 'create', parentId: ROOT_PARENT_ID })}
          >
            <Plus className="size-4" />
            {t('common.新增菜单', { defaultValue: '新增菜单' })}
          </Button>
        </Perm>
      </div>

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <TriangleAlert className="size-3.5 shrink-0" />
        {t('common.树数据来自菜单表，改动即影响全站路由与权限，请谨慎操作', {
          defaultValue: '树数据来自菜单表，改动即影响全站路由与权限，请谨慎操作',
        })}
      </p>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1 xl:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('common.搜索菜单名称、路由或权限', {
                defaultValue: '搜索菜单名称、路由或权限',
              })}
              className="pl-9"
            />
          </div>
          <div
            role="group"
            aria-label={t('common.菜单类型筛选', { defaultValue: '菜单类型筛选' })}
            className="flex items-center rounded-md border border-border p-0.5"
          >
            {(
              [
                ['ALL', '全部'],
                ['C', '目录'],
                ['M', '菜单'],
                ['F', '按钮'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={typeFilter === value}
                onClick={() => setTypeFilter(value)}
                className={cn(
                  'rounded px-3 py-1.5 text-xs transition-colors',
                  typeFilter === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {t(`dyna.${label}`, { defaultValue: label })}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={filtering}
              onClick={() => setCollapsed(new Set())}
            >
              <ChevronsUpDown className="size-4" />
              {t('common.全部展开', { defaultValue: '全部展开' })}
            </Button>
            <Button variant="ghost" size="sm" disabled={filtering} onClick={collapseAll}>
              <ChevronsDownUp className="size-4" />
              {t('common.全部折叠', { defaultValue: '全部折叠' })}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 border-b border-border bg-muted/20">
          {[
            { type: 'C', label: '目录', icon: FolderTree, count: typeCounts.C },
            { type: 'M', label: '菜单', icon: PanelTop, count: typeCounts.M },
            { type: 'F', label: '按钮', icon: MousePointerClick, count: typeCounts.F },
          ].map((item, index) => (
            <div
              key={item.type}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                index > 0 && 'border-l border-border',
              )}
            >
              <item.icon className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {t(`dyna.${item.label}`, { defaultValue: item.label })}
              </span>
              <strong className="ml-auto font-mono text-sm font-semibold">{item.count}</strong>
            </div>
          ))}
        </div>

        <MenuTreeTable
          tree={filteredTree}
          isLoading={isLoading}
          collapsed={effectiveCollapsed}
          onToggle={toggle}
          onCreateChild={(node) => setFormPayload({ mode: 'create', parentId: node.id })}
          onEdit={(node) => setFormPayload({ mode: 'edit', node })}
          onDelete={setDeleting}
        />

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            {t('common.显示 {{visible}} / {{total}} 个菜单节点', {
              defaultValue: '显示 {{visible}} / {{total}} 个菜单节点',
              visible: filteredNodes.length,
              total: allNodes.length,
            })}
          </span>
          <span>
            {t('common.树形数据全量加载，不分页', {
              defaultValue: '树形数据全量加载，不分页',
            })}
          </span>
        </footer>
      </section>

      <MenuFormDialog
        open={formPayload !== null}
        payload={formPayload ?? { mode: 'create', parentId: ROOT_PARENT_ID }}
        tree={tree}
        onOpenChange={(open) => !open && setFormPayload(null)}
        onSaved={() => void invalidate()}
      />

      <MenuDeleteDialog
        node={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => void invalidate()}
      />
    </div>
  )
}
