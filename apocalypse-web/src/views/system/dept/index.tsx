/**
 * 部门管理：手写树页（树形表格 + 展开折叠 + 行内「新增下级」）。
 * 越出标准 CRUD 模式（树结构、非分页端点），按 DynaLayer 逃逸舱原则手写；
 *
 * 端点对照（后端 DeptController）：
 * - 树     GET    /system/depts/tree（system:dept:list）
 * - 新增   POST   /system/depts（system:dept:add）
 * - 编辑   PUT    /system/depts/{id}（system:dept:edit）
 * - 删除   DELETE /system/depts/{id}（system:dept:remove；存在子部门/挂接用户时后端拒绝）
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
import { DynaPagination, DynaQueryFeedback } from '@/components/dyna'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PulseIndicator } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

import { Network, Rows3 } from 'lucide-react'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { LivingContextBar, useEntityIntent } from '@/components/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented-control'

import { createDept, deleteDept, getDeptTree, updateDept } from './api'
import { ancestorPath, findNode } from './dept-chart.model'
import { DeptOrgChart } from './DeptOrgChart'
import { DeptFormDialog, type DeptFormValues } from './DeptFormDialog'
import { filterDeptTree, flattenDeptTree } from './tree-utils'
import { ROOT_DEPT_ID, type DeptSaveReq, type DeptTreeNode, type SnowflakeId } from './types'

const DEPT_VIEWS = ['chart', 'table'] as const

export default function DeptPage() {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <DeptWorkspace key={authorizationEpoch} />
}

function DeptWorkspace() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const { intent: deptIntent } = useEntityIntent('dept')
  const desktop = useDesktopViewport()
  const [requestedView, setView] = usePageView(DEPT_VIEWS, 'deptView')
  // The organisation chart is a desktop workspace; narrow screens keep the tree table.
  const view = desktop ? requestedView : 'table'
  const queryClient = useQueryClient()
  /** 展开的部门 id 集（首次加载默认展开根级部门节点）。 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [seededRootExpand, setSeededRootExpand] = useState(false)
  const [deptQuery, setDeptQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DeptTreeNode | null>(null)
  const [defaultParentId, setDefaultParentId] = useState<SnowflakeId>(ROOT_DEPT_ID)
  const [deleting, setDeleting] = useState<DeptTreeNode | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ id: string; sequence: number }>()
  const [appliedIntentId, setAppliedIntentId] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState('')

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['system', 'depts', 'tree'],
    queryFn: getDeptTree,
  })
  const denial = useResourceDenial({
    errors: [error],
    clear: { queryKey: ['system', 'depts'] },
    reset: () => {
      setDialogOpen(false)
      setEditing(null)
      setDeleting(null)
      setFocusRequest(undefined)
      setLastResult('')
    },
  })
  const tree = isResourceDenied(error) ? undefined : data
  const filtering = deptQuery.trim().length > 0 || statusFilter !== 'all'

  if (tree && tree.length > 0 && !seededRootExpand) {
    setSeededRootExpand(true)
    setExpanded((prev) => new Set([...prev, ...tree.map((node) => node.id)]))
  }

  const intentTargetId = deptIntent?.focusTargetId ?? deptIntent?.id ?? null
  if (
    tree &&
    intentTargetId &&
    appliedIntentId !== intentTargetId &&
    findNode(tree, intentTargetId)
  ) {
    setAppliedIntentId(intentTargetId)
    const nextExpanded = new Set([...expanded, ...ancestorPath(tree, intentTargetId)])
    setExpanded(nextExpanded)
    const nextCollapsed = filtering
      ? new Set<string>()
      : new Set(
          flattenDeptTree(tree, new Set())
            .filter((row) => row.hasChildren && !nextExpanded.has(row.node.id))
            .map((row) => row.node.id),
        )
    const targetTree = filterDeptTree(tree, deptQuery, statusFilter)
    const targetIdx = flattenDeptTree(targetTree, nextCollapsed).findIndex(
      (row) => row.node.id === intentTargetId,
    )
    if (targetIdx >= 0) {
      setPage(Math.floor(targetIdx / pageSize) + 1)
    }
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system', 'depts'] })

  const localKey = JSON.stringify([dialogOpen, editing?.id, deleting?.id])
  const saveMutation = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: async (run, values: DeptFormValues) => {
      const body: DeptSaveReq = {
        parentId: values.parentId,
        deptName: values.deptName,
        leader: values.leader || undefined,
        phone: values.phone || undefined,
        sort: values.sort === '' ? undefined : Number(values.sort),
        status: values.status ? 1 : 0,
        remark: values.remark || undefined,
      }
      const permission = editing ? 'system:dept:edit' : 'system:dept:add'
      return run({
        scope: undefined,
        requiredPerms: [permission],
        requiredAllScopePerms: [permission],
        execute: async (transport) => {
          if (editing) {
            await updateDept(editing.id, body, transport)
            return editing.id
          }
          return createDept(body, transport)
        },
      })
    },
    onSuccess: (id, values) => {
      setFocusRequest((current) => ({ id, sequence: (current?.sequence ?? 0) + 1 }))
      setLastResult(
        systemT(editing ? 'deptChart.updated' : 'deptChart.created', { name: values.deptName }),
      )
      toast.success(
        editing
          ? t('common.部门已更新', { defaultValue: '部门已更新' })
          : t('common.部门已创建', { defaultValue: '部门已创建' }),
      )
      setDialogOpen(false)
      void invalidate()
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.保存失败', { defaultValue: '保存失败' }),
      )
    },
  })

  const deleteMutation = useModuleMutation(undefined, {
    localKey,
    onDenied: denial,
    mutationFn: (run, id: SnowflakeId) =>
      run({
        scope: undefined,
        requiredPerms: ['system:dept:remove'],
        requiredAllScopePerms: ['system:dept:remove'],
        execute: (transport) => deleteDept(id, transport),
      }),
    onSuccess: () => {
      if (deleting) {
        setFocusRequest((current) => ({
          id:
            deleting.parentId === ROOT_DEPT_ID
              ? (tree?.find((node) => node.id !== deleting.id)?.id ?? '')
              : deleting.parentId,
          sequence: (current?.sequence ?? 0) + 1,
        }))
        setLastResult(systemT('deptChart.deleted', { name: deleting.deptName }))
      }
      toast.success(t('common.部门已删除', { defaultValue: '部门已删除' }))
      setDeleting(null)
      void invalidate()
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.删除失败', { defaultValue: '删除失败' }),
      )
    },
  })

  const toggleExpanded = (id: SnowflakeId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const openCreate = (parentId: SnowflakeId) => {
    setEditing(null)
    setDefaultParentId(parentId)
    setDialogOpen(true)
  }

  const openEdit = (node: DeptTreeNode) => {
    setEditing(node)
    setDialogOpen(true)
  }

  const filteredTree = useMemo(
    () => (tree ? filterDeptTree(tree, deptQuery, statusFilter) : undefined),
    [tree, deptQuery, statusFilter],
  )
  const expandableIds = useMemo(
    () =>
      tree
        ? flattenDeptTree(tree, new Set())
            .filter((row) => row.hasChildren)
            .map((row) => row.node.id)
        : [],
    [tree],
  )
  const collapsed = useMemo<ReadonlySet<string>>(
    () => (filtering ? new Set() : new Set(expandableIds.filter((id) => !expanded.has(id)))),
    [expandableIds, expanded, filtering],
  )
  const rows = useMemo(
    () => (filteredTree ? flattenDeptTree(filteredTree, collapsed) : []),
    [filteredTree, collapsed],
  )
  const ancestorNamesById = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!filteredTree) return map
    const walk = (nodes: DeptTreeNode[], trail: string[]) => {
      for (const node of nodes) {
        map.set(node.id, trail)
        if (node.children?.length) walk(node.children, [...trail, node.deptName])
      }
    }
    walk(filteredTree, [])
    return map
  }, [filteredTree])
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize],
  )
  const pageNodeIds = useMemo(() => new Set(pagedRows.map((row) => row.node.id)), [pagedRows])
  const deletingChildCount = deleting?.children?.length ?? 0

  return (
    <div className="w-full min-w-0 space-y-5 p-4 sm:p-6">
      <PageHeader
        title={t('common.部门管理', { defaultValue: '部门管理' })}
        view={
          desktop ? (
            <SegmentedControl
              label={systemT('deptChart.view')}
              value={view}
              onChange={setView}
              options={[
                { value: 'chart', label: systemT('deptChart.chart'), icon: Network },
                { value: 'table', label: systemT('deptChart.table'), icon: Rows3 },
              ]}
            />
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Perm perm="system:dept:add" requiresAllScope>
              <Button onClick={() => openCreate(ROOT_DEPT_ID)}>
                <Plus className="size-4" />
                {t('common.新增部门', { defaultValue: '新增部门' })}
              </Button>
            </Perm>
          </div>
        }
      />

      {view === 'table' && deptIntent?.source && <LivingContextBar source={deptIntent.source} />}

      <DynaQueryFeedback
        error={error}
        hasData={tree !== undefined}
        refreshing={isFetching}
        onRetry={() => void refetch()}
      />
      {view === 'chart' && isLoading && <Skeleton className="h-[34rem] w-full" />}
      {lastResult && (
        <p
          role="status"
          className="rounded-control border border-border-subtle bg-card px-3 py-2 text-sm"
        >
          {lastResult}
        </p>
      )}
      {tree && (
        <div hidden={view !== 'chart'}>
          <DeptOrgChart
            focusRequest={focusRequest}
            active={view === 'chart'}
            tree={tree}
            onCreateChild={openCreate}
            onEdit={openEdit}
            onDelete={setDeleting}
          />
        </div>
      )}
      {view === 'table' && (!error || tree !== undefined) && (
        <div className="space-y-4">
          <div
            className="overflow-hidden rounded-panel border border-border-subtle bg-card shadow-surface"
            aria-busy={isFetching}
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border-subtle bg-muted/20 px-4 py-2.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                <div className="relative min-w-48 flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={deptQuery}
                    onChange={(event) => {
                      setDeptQuery(event.target.value)
                      setPage(1)
                    }}
                    placeholder="搜索部门名称 / 负责人 / 电话…"
                    aria-label="搜索部门名称或负责人"
                    className="h-8 pl-9 text-xs"
                  />
                </div>
                <div
                  role="group"
                  aria-label="部门状态筛选"
                  className="inline-flex h-8 items-center gap-0.5 rounded-control border border-border-subtle bg-muted/60 p-0.5"
                >
                  {(
                    [
                      { value: 'all', label: '全部' },
                      { value: '1', label: '正常' },
                      { value: '0', label: '停用' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={statusFilter === option.value}
                      onClick={() => {
                        setStatusFilter(option.value)
                        setPage(1)
                      }}
                      className={cn(
                        'inline-flex h-full items-center rounded-md px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        statusFilter === option.value
                          ? 'bg-card font-medium text-foreground shadow-xs'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {filtering && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => {
                      setDeptQuery('')
                      setStatusFilter('all')
                      setPage(1)
                    }}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    重置
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={filtering || expandableIds.length === 0}
                  onClick={() => setExpanded(new Set(expandableIds))}
                >
                  <ChevronsUpDown className="size-4" aria-hidden="true" />
                  {t('common.全部展开', { defaultValue: '全部展开' })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={filtering || expandableIds.length === 0}
                  onClick={() => {
                    setExpanded(new Set())
                    setPage(1)
                  }}
                >
                  <ChevronsDownUp className="size-4" aria-hidden="true" />
                  {t('common.全部折叠', { defaultValue: '全部折叠' })}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.部门名称', { defaultValue: '部门名称' })}</TableHead>
                    <TableHead>{t('common.负责人', { defaultValue: '负责人' })}</TableHead>
                    <TableHead>{t('common.联系电话', { defaultValue: '联系电话' })}</TableHead>
                    <TableHead className="w-16">
                      {t('common.排序', { defaultValue: '排序' })}
                    </TableHead>
                    <TableHead className="w-20">
                      {t('common.状态', { defaultValue: '状态' })}
                    </TableHead>
                    <TableHead>{t('common.备注', { defaultValue: '备注' })}</TableHead>
                    <TableHead className="w-32 text-right">
                      {t('common.操作', { defaultValue: '操作' })}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 7 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {!isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                        {t('common.暂无数据', { defaultValue: '暂无数据' })}
                      </TableCell>
                    </TableRow>
                  )}
                  {pagedRows.map((row) => {
                    const node = row.node
                    const isCollapsed = collapsed.has(node.id)
                    const ancestorNames = ancestorNamesById.get(node.id) ?? []
                    const parentOffPage =
                      row.depth > 0 && !pageNodeIds.has(node.parentId) && ancestorNames.length > 0
                    return (
                      <TableRow key={node.id}>
                        <TableCell>
                          <div
                            className="flex items-center gap-1"
                            style={{ paddingLeft: `calc(var(--spacing) * ${row.depth * 6})` }}
                          >
                            {row.hasChildren ? (
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
                                onClick={() => toggleExpanded(node.id)}
                              >
                                <ChevronRight
                                  className={cn(
                                    'size-3.5 transition-transform',
                                    !isCollapsed && 'rotate-90',
                                  )}
                                />
                              </Button>
                            ) : (
                              <span className="size-6 shrink-0" />
                            )}
                            <div className="min-w-0">
                              {parentOffPage && (
                                <div
                                  data-slot="dept-page-ancestor-trail"
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
                              <span className="font-medium">{node.deptName}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{node.leader ?? '-'}</TableCell>
                        <TableCell>{node.phone ?? '-'}</TableCell>
                        <TableCell>{node.sort}</TableCell>
                        <TableCell>
                          <DictTag type="sys_user_status" value={node.status} />
                        </TableCell>
                        <TableCell
                          className="max-w-48 truncate text-muted-foreground"
                          title={node.remark ?? undefined}
                        >
                          {node.remark ?? '-'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Perm perm="system:dept:add" requiresAllScope>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('common.新增下级', { defaultValue: '新增下级' })}
                              onClick={() => openCreate(node.id)}
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </Perm>
                          <Perm perm="system:dept:edit" requiresAllScope>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('common.编辑', { defaultValue: '编辑' })}
                              onClick={() => openEdit(node)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </Perm>
                          <Perm perm="system:dept:remove" requiresAllScope>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('common.删除', { defaultValue: '删除' })}
                              onClick={() => setDeleting(node)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </Perm>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          {tree !== undefined && rows.length > 0 && (
            <DynaPagination
              page={currentPage}
              size={pageSize}
              total={rows.length}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize)
                setPage(1)
              }}
            />
          )}
        </div>
      )}

      {/* 新增 / 编辑对话框 */}
      <DeptFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultParentId={defaultParentId}
        tree={tree ?? []}
        isPending={saveMutation.isPending}
        onSubmit={(values) => saveMutation.mutate(values)}
      />

      {/* 删除确认 */}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('common.确认删除', { defaultValue: '确认删除' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('common.将删除部门「{{name}}」，该操作为逻辑删除。', {
                name: deleting?.deptName ?? '',
                defaultValue: '将删除部门「{{name}}」，该操作为逻辑删除。',
              })}
              {deletingChildCount > 0 && (
                <span className="text-destructive">
                  {t('common.注意：该部门下含 {{count}} 个子部门，存在子部门时不允许删除。', {
                    count: deletingChildCount,
                    defaultValue: '注意：该部门下含 {{count}} 个子部门，存在子部门时不允许删除。',
                  })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('common.取消', { defaultValue: '取消' })}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (deleting) deleteMutation.mutate(deleting.id)
              }}
            >
              {deleteMutation.isPending && <PulseIndicator variant="inline" tone="current" />}
              {deleteMutation.isPending
                ? t('common.删除中…', { defaultValue: '删除中…' })
                : t('common.确认删除', { defaultValue: '确认删除' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
