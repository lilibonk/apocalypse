/**
 * 菜单树表格（页面局部）：5 列高信噪比树表（菜单层级、路由与模块契约、显示与状态、排序、操作）。
 * 组件路径与历史 F 权限标识收拢至右侧/抽屉 Inspector，保持主表清爽。
 * 支持 Alt+Click 递归展开/折叠整支子树与缩进引导线。
 */

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
import { DynaPagination } from '@/components/dyna'
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
import { cn } from '@/lib/utils'

import { collectSubtreeIds, type MenuNode, type MenuType } from './menu.types'

const COLUMN_COUNT = 5

const TYPE_META: Record<MenuType, { label: string; variant: 'default' | 'secondary' | 'outline' }> =
  {
    // Neutral chips: the brand fill is reserved for primary actions, not row metadata.
    C: { label: '目录', variant: 'secondary' },
    M: { label: '菜单', variant: 'outline' },
    F: { label: '按钮', variant: 'outline' },
  }

interface VisibleRow {
  node: MenuNode
  depth: number
  ancestorNames: string[]
}

function flattenVisible(
  nodes: MenuNode[],
  collapsed: Set<string>,
  depth = 0,
  ancestorNames: string[] = [],
): VisibleRow[] {
  return nodes.flatMap((node) => [
    { node, depth, ancestorNames },
    ...(collapsed.has(node.id)
      ? []
      : flattenVisible(node.children, collapsed, depth + 1, [...ancestorNames, node.menuName])),
  ])
}

export function MenuTreeTable({
  tree,
  isLoading,
  collapsed,
  onToggle,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
  filtering,
  onResetFilters,
  highlightId = null,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  tree: MenuNode[]
  highlightId?: string | null
  isLoading: boolean
  collapsed: Set<string>
  onToggle: (id: string, recursive?: boolean) => void
  onSelect?: (id: string) => void
  onCreateChild: (node: MenuNode) => void
  onEdit: (node: MenuNode) => void
  onDelete: (node: MenuNode) => void
  filtering: boolean
  onResetFilters: () => void
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
}) {
  const { t } = useTranslation()
  const [internalPage, setInternalPage] = useState(1)
  const [internalPageSize, setInternalPageSize] = useState(20)
  const rows = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])
  const activePageSize = pageSize ?? internalPageSize
  const totalPages = Math.max(1, Math.ceil(rows.length / activePageSize))
  const activePage = Math.min(page ?? internalPage, totalPages)
  const pagedRows = useMemo(
    () => rows.slice((activePage - 1) * activePageSize, activePage * activePageSize),
    [rows, activePage, activePageSize],
  )
  const pageNodeIds = useMemo(() => new Set(pagedRows.map((entry) => entry.node.id)), [pagedRows])
  const handlePageChange = onPageChange ?? setInternalPage
  const handlePageSizeChange = (nextSize: number) => {
    if (onPageSizeChange) {
      onPageSizeChange(nextSize)
    } else {
      setInternalPageSize(nextSize)
      setInternalPage(1)
    }
  }

  return (
    <>
      <div
        role="region"
        tabIndex={0}
        aria-label={t('common.菜单管理', { defaultValue: '菜单列表' })}
        className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64">
                {t('common.菜单层级', { defaultValue: '菜单层级' })}
              </TableHead>
              <TableHead className="min-w-52">
                {t('common.路由定义', { defaultValue: '路由定义' })}
              </TableHead>
              <TableHead className="w-36">
                {t('common.显示与状态', { defaultValue: '显示与状态' })}
              </TableHead>
              <TableHead className="w-20">{t('common.排序', { defaultValue: '排序' })}</TableHead>
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
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="space-y-3 py-6">
                    <p>
                      {filtering
                        ? t('dyna.queryNoMatches')
                        : t('common.暂无数据', { defaultValue: '暂无数据' })}
                    </p>
                    {filtering && (
                      <Button variant="outline" size="sm" onClick={onResetFilters}>
                        {t('dyna.queryClearFilters')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {pagedRows.map(({ node, depth, ancestorNames }) => {
              const isCollapsed = collapsed.has(node.id)
              const hasChildren = node.children.length > 0
              const subtreeCount = hasChildren ? collectSubtreeIds(node).size - 1 : 0
              const typeMeta = TYPE_META[node.menuType]
              const parentOffPage =
                depth > 0 && !pageNodeIds.has(node.parentId) && ancestorNames.length > 0
              return (
                <TableRow
                  key={node.id}
                  id={`menu-row-${node.id}`}
                  tabIndex={highlightId === node.id ? -1 : undefined}
                  data-highlight={highlightId === node.id || undefined}
                  onClick={() => onSelect?.(node.id)}
                  className={cn(
                    'group cursor-pointer data-[highlight]:bg-accent data-[highlight]:outline-2 data-[highlight]:outline-ring',
                  )}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {depth > 0 && (
                        <span
                          aria-hidden="true"
                          className="flex shrink-0 items-center self-stretch"
                        >
                          {Array.from({ length: Math.min(depth, 6) }).map((_, guideIdx) => (
                            <span
                              key={guideIdx}
                              className="inline-block h-6 w-5 border-l border-border-subtle/80"
                            />
                          ))}
                        </span>
                      )}
                      {hasChildren ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          aria-expanded={!isCollapsed}
                          aria-label={
                            isCollapsed
                              ? t('common.展开', { defaultValue: '展开' })
                              : t('common.折叠', { defaultValue: '折叠' })
                          }
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggle(node.id, event.altKey)
                          }}
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
                        {parentOffPage && (
                          <div
                            data-slot="menu-page-ancestor-trail"
                            className="mb-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"
                          >
                            {ancestorNames.map((ancName, index) => (
                              <Fragment key={`${node.id}-anc-${index}`}>
                                {index > 0 && <span aria-hidden="true">/</span>}
                                <span className="max-w-28 truncate">{ancName}</span>
                              </Fragment>
                            ))}
                            <span aria-hidden="true">/</span>
                          </div>
                        )}
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{node.menuName}</span>
                          <Badge variant={typeMeta.variant} className="shrink-0">
                            {node.menuType === 'F'
                              ? t('system:authorization.legacyButton')
                              : t(`dyna.${typeMeta.label}`, { defaultValue: typeMeta.label })}
                          </Badge>
                          {isCollapsed && subtreeCount > 0 && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                              +{subtreeCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5 font-mono text-xs">
                      <div className="truncate text-foreground">{node.path ?? '—'}</div>
                      {node.component && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {node.component}
                        </div>
                      )}
                    </div>
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
                  <TableCell className="font-mono tabular-nums">{node.sort}</TableCell>
                  <TableCell
                    className="text-right whitespace-nowrap"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {node.menuType !== 'F' && (
                      <Perm perm="system:menu:add" requiresAllScope>
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
                    <Perm perm="system:menu:edit" requiresAllScope>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('common.编辑', { defaultValue: '编辑' })}
                            disabled={node.menuType === 'F'}
                            onClick={() => onEdit(node)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('common.编辑', { defaultValue: '编辑' })}
                        </TooltipContent>
                      </Tooltip>
                    </Perm>
                    <Perm perm="system:menu:remove" requiresAllScope>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('common.删除', { defaultValue: '删除' })}
                            disabled={node.menuType === 'F'}
                            onClick={() => onDelete(node)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('common.删除', { defaultValue: '删除' })}
                        </TooltipContent>
                      </Tooltip>
                    </Perm>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {!isLoading && rows.length > 0 && (
        <div className="border-t border-border-subtle px-4 py-3">
          <DynaPagination
            page={activePage}
            size={activePageSize}
            total={rows.length}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}
    </>
  )
}
