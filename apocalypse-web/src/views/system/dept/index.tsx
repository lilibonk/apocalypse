/**
 * 部门管理：手写树页（树形表格 + 展开折叠 + 行内「新增下级」）。
 * 越出标准 CRUD 模式（树结构、非分页端点），按 DynaLayer 逃逸舱原则手写；
 * 视觉/交互以 views/_dev/user-handwritten.tsx（golden sample）为底本。
 *
 * 端点对照（后端 DeptController）：
 * - 树     GET    /system/depts/tree（system:dept:list）
 * - 新增   POST   /system/depts（system:dept:add）
 * - 编辑   PUT    /system/depts/{id}（system:dept:edit）
 * - 删除   DELETE /system/depts/{id}（system:dept:remove；存在子部门/挂接用户时后端拒绝）
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
import { DynaQueryFeedback } from '@/components/dyna'
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
import { Button } from '@/components/ui/button'
import { PixelScale } from '@/effects/PixelWave'
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
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented-control'

import { createDept, deleteDept, getDeptTree, updateDept } from './api'
import { DeptOrgChart } from './DeptOrgChart'
import { DeptFormDialog, type DeptFormValues } from './DeptFormDialog'
import { flattenDeptTree } from './tree-utils'
import { ROOT_DEPT_ID, type DeptSaveReq, type DeptTreeNode, type SnowflakeId } from './types'

const DEPT_VIEWS = ['chart', 'table'] as const

export default function DeptPage() {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <DeptWorkspace key={authorizationEpoch} />
}

function DeptWorkspace() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const desktop = useDesktopViewport()
  const [requestedView, setView] = usePageView(DEPT_VIEWS, 'deptView')
  // The organisation chart is a desktop workspace; narrow screens keep the tree table.
  const view = desktop ? requestedView : 'table'
  const queryClient = useQueryClient()
  /** 展开的部门 id 集（默认空 = 只显示根节点）。 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DeptTreeNode | null>(null)
  const [defaultParentId, setDefaultParentId] = useState<SnowflakeId>(ROOT_DEPT_ID)
  const [deleting, setDeleting] = useState<DeptTreeNode | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ id: string; sequence: number }>()
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
    () => new Set(expandableIds.filter((id) => !expanded.has(id))),
    [expandableIds, expanded],
  )
  const rows = tree ? flattenDeptTree(tree, collapsed) : []
  const totalDepartments = tree ? flattenDeptTree(tree, new Set()).length : 0
  const deletingChildCount = deleting?.children?.length ?? 0

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('common.部门管理', { defaultValue: '部门管理' })}
        description={t('common.组织部门的树形维护', { defaultValue: '组织部门的树形维护' })}
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
          <Perm perm="system:dept:add" requiresAllScope>
            <Button onClick={() => openCreate(ROOT_DEPT_ID)}>
              <Plus className="size-4" />
              {t('common.新增部门', { defaultValue: '新增部门' })}
            </Button>
          </Perm>
        }
      />

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
        <div
          className="overflow-hidden rounded-panel border border-border-subtle bg-card shadow-surface"
          aria-busy={isFetching}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.部门名称', { defaultValue: '部门名称' })}</TableHead>
                <TableHead>{t('common.负责人', { defaultValue: '负责人' })}</TableHead>
                <TableHead>{t('common.联系电话', { defaultValue: '联系电话' })}</TableHead>
                <TableHead className="w-16">{t('common.排序', { defaultValue: '排序' })}</TableHead>
                <TableHead className="w-20">{t('common.状态', { defaultValue: '状态' })}</TableHead>
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
              {rows.map((row) => {
                const node = row.node
                const isCollapsed = collapsed.has(node.id)
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
                        <span className="font-medium">{node.deptName}</span>
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
          {tree !== undefined && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                {t('common.显示 {{visible}} / {{total}} 个部门', {
                  defaultValue: '显示 {{visible}} / {{total}} 个部门',
                  visible: rows.length,
                  total: totalDepartments,
                })}
              </span>
              <span>
                {t('common.树形数据全量加载，不分页', {
                  defaultValue: '树形数据全量加载，不分页',
                })}
              </span>
            </div>
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
              {deleteMutation.isPending && <PixelScale variant="inline" tone="current" />}
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
