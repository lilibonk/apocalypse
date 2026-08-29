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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
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
import { cn } from '@/lib/utils'

import { createDept, deleteDept, getDeptTree, updateDept } from './api'
import { DeptFormDialog, type DeptFormValues } from './DeptFormDialog'
import { flattenDeptTree } from './tree-utils'
import { ROOT_DEPT_ID, type DeptSaveReq, type DeptTreeNode, type SnowflakeId } from './types'

export default function DeptPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  /** 折叠的部门 id 集（默认空 = 全部展开）。 */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DeptTreeNode | null>(null)
  const [defaultParentId, setDefaultParentId] = useState<SnowflakeId>(ROOT_DEPT_ID)
  const [deleting, setDeleting] = useState<DeptTreeNode | null>(null)

  const { data: tree, isLoading } = useQuery({
    queryKey: ['system', 'depts', 'tree'],
    queryFn: getDeptTree,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system', 'depts'] })

  const saveMutation = useMutation({
    mutationFn: async (values: DeptFormValues) => {
      const body: DeptSaveReq = {
        parentId: values.parentId,
        deptName: values.deptName,
        leader: values.leader || undefined,
        phone: values.phone || undefined,
        sort: values.sort === '' ? undefined : Number(values.sort),
        status: values.status ? 1 : 0,
        remark: values.remark || undefined,
      }
      if (editing) {
        return updateDept(editing.id, body)
      }
      return createDept(body)
    },
    onSuccess: () => {
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

  const deleteMutation = useMutation({
    mutationFn: (id: SnowflakeId) => deleteDept(id),
    onSuccess: () => {
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

  const toggleCollapsed = (id: SnowflakeId) => {
    setCollapsed((prev) => {
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

  const rows = tree ? flattenDeptTree(tree, collapsed) : []
  const totalDepartments = tree ? flattenDeptTree(tree, new Set()).length : 0
  const deletingChildCount = deleting?.children?.length ?? 0

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t('common.部门管理', { defaultValue: '部门管理' })}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('common.组织部门的树形维护', { defaultValue: '组织部门的树形维护' })}
          </p>
        </div>
        <Perm perm="system:dept:add">
          <Button size="sm" onClick={() => openCreate(ROOT_DEPT_ID)}>
            <Plus className="size-4" />
            {t('common.新增部门', { defaultValue: '新增部门' })}
          </Button>
        </Perm>
      </div>

      {/* 树形表格 */}
      <div className="rounded-lg border border-border">
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
                          aria-label={
                            isCollapsed
                              ? t('common.展开', { defaultValue: '展开' })
                              : t('common.折叠', { defaultValue: '折叠' })
                          }
                          onClick={() => toggleCollapsed(node.id)}
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
                    <Perm perm="system:dept:add">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('common.新增下级', { defaultValue: '新增下级' })}
                        onClick={() => openCreate(node.id)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </Perm>
                    <Perm perm="system:dept:edit">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('common.编辑', { defaultValue: '编辑' })}
                        onClick={() => openEdit(node)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </Perm>
                    <Perm perm="system:dept:remove">
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
      </div>

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
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
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
            <AlertDialogCancel>{t('common.取消', { defaultValue: '取消' })}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              {t('common.确认删除', { defaultValue: '确认删除' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
