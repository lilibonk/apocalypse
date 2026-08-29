/**
 * DynaPage：组装 DynaSearch + DynaTable + DynaForm 为标准 CRUD 页。
 *
 * 端点约定（v1 收敛，后端 system 域 Controller 均为该形态）：
 * - 列表 GET {endpoint}/page?page&size&{搜索项…}
 * - 新增 POST {endpoint}
 * - 编辑/启停 PUT {endpoint}/{id}
 * - 删除 DELETE {endpoint}/{id}
 * 越出该形态的页面请走逃逸舱（手写页面组件，参照 views/_dev/user-handwritten.tsx）。
 *
 * schema 非法（zod 校验失败）时渲染明确错误面板而不是静默白屏 ——
 * CI 已有 schema.test.ts 全量校验，这里是页面级兜底。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { MotionSequence, MotionSequenceItem } from '@/components/motion/MotionSequence'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PixelScale } from '@/effects/PixelWave'
import { ApiError, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'

import { DynaDetail } from './DynaDetail'
import { DynaForm } from './DynaForm'
import { DynaSearch } from './DynaSearch'
import { DynaTable } from './DynaTable'
import { validatePageSchema, type DynaPageSchema, type DynaStatusToggleAction } from './schema'
import { useDynaText } from './use-dyna'

type Row = Record<string, unknown>

interface DialogState {
  mode: 'create' | 'edit'
  row: Row | null
}

interface ToggleState {
  row: Row
  action: DynaStatusToggleAction
  label: string
}

/** 雪花 id 等主键原样转 string 使用，禁止 Number()（JS 精度丢失）。 */
function rowIdOf(row: Row, rowKey: string): string {
  const id = row[rowKey]
  if (id === null || id === undefined) throw new Error(`行数据缺少主键字段 ${rowKey}`)
  return String(id)
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

export interface DynaPageProps {
  schema: DynaPageSchema
  /**
   * custom 行操作的 handler 注册表：action.key → 点击回调（拿到整行数据）。
   * 越出标准 CRUD 的行级动作（授权弹窗、跳转等）由页面经此注入；
   * schema 里声明了 custom 但未注册 handler 的 key 渲染为禁用按钮（失配可见）。
   */
  customActions?: Record<string, (row: Record<string, unknown>) => void>
}

export function DynaPage({ schema, customActions }: DynaPageProps) {
  const t = useDynaText()
  const queryClient = useQueryClient()

  const validation = useMemo(() => validatePageSchema(schema), [schema])

  const rowKey = schema.rowKey ?? 'id'
  const defaultPageSize = schema.pageSize ?? 10
  const entity = t(schema.entityName ?? '记录')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({})
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({})
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [viewing, setViewing] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [toggling, setToggling] = useState<ToggleState | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dyna', schema.key, page, appliedSearch],
    queryFn: () => {
      const query: Record<string, string | number | undefined> = { page, size: pageSize }
      for (const [name, value] of Object.entries(appliedSearch)) {
        query[name] = value === '' ? undefined : value
      }
      return request<PageResult<Row>>(`${schema.endpoint}/page`, { query })
    },
    enabled: validation.success,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['dyna', schema.key] })

  const saveMutation = useMutation({
    mutationFn: (input: { body: Row; mode: 'create' | 'edit'; id?: string }) =>
      input.mode === 'create'
        ? request<Row>(schema.endpoint, { method: 'POST', body: input.body })
        : request<Row>(`${schema.endpoint}/${input.id}`, { method: 'PUT', body: input.body }),
    onSuccess: (_result, input) => {
      toast.success(t(input.mode === 'create' ? 'created' : 'updated', { entity }))
      setDialog(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorText(error, t('保存失败'))),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => request<void>(`${schema.endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('deleted', { entity }))
      setDeleting(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorText(error, t('删除失败'))),
  })

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; body: Row }) =>
      request<Row>(`${schema.endpoint}/${input.id}`, {
        method: 'PUT',
        body: input.body,
      }),
    onSuccess: () => {
      toast.success(t('操作成功'))
      setToggling(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorText(error, t('操作失败'))),
  })

  if (!validation.success) {
    return (
      <div className="w-full space-y-4 p-4 sm:p-6">
        <div className="rounded-lg border border-destructive p-4">
          <h1 className="text-base font-semibold text-destructive">
            {t('页面 schema 校验失败')}（{schema.key}）
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('请修正 schema，或走逃逸舱手写页面组件。')}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
            {validation.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  const handleToggle = (row: Row, action: DynaStatusToggleAction) => {
    const next = row[action.field] === action.onValue ? action.offValue : action.onValue
    // submitRow：全量替换语义的更新端点（如 RoleSaveReq 必填 roleName/roleKey）提交整行
    const body = action.submitRow ? { ...row, [action.field]: next } : { [action.field]: next }
    toggleMutation.mutate({ id: rowIdOf(row, rowKey), body })
  }

  const renderActions = (row: Row) => (
    <>
      {(schema.rowActions ?? []).map((action) => {
        if (action.kind === 'view') {
          const label = t(action.label ?? '查看')
          const button = (
            <Tooltip key="view">
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={label}
                  onClick={() => setViewing(row)}
                >
                  <Eye className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
          return action.perm ? (
            <Perm key="view" perm={action.perm}>
              {button}
            </Perm>
          ) : (
            button
          )
        }
        if (action.kind === 'edit') {
          const label = t(action.label ?? '编辑')
          const button = (
            <Tooltip key="edit">
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={label}
                  onClick={() => setDialog({ mode: 'edit', row })}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
          return action.perm ? (
            <Perm key="edit" perm={action.perm}>
              {button}
            </Perm>
          ) : (
            button
          )
        }
        if (action.kind === 'delete') {
          const label = t(action.label ?? '删除')
          const button = (
            <Tooltip key="delete">
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={label}
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
          return action.perm ? (
            <Perm key="delete" perm={action.perm}>
              {button}
            </Perm>
          ) : (
            button
          )
        }
        // custom：文案按钮，点击调页面注入的 handler；未注册 handler 时禁用（失配可见）
        if (action.kind === 'custom') {
          const handler = customActions?.[action.key]
          const button = (
            <Button
              key={`custom-${action.key}`}
              variant="ghost"
              size="sm"
              aria-label={t(action.label)}
              disabled={!handler}
              onClick={() => handler?.(row)}
            >
              {t(action.label)}
            </Button>
          )
          return action.perm ? (
            <Perm key={`custom-${action.key}`} perm={action.perm}>
              {button}
            </Perm>
          ) : (
            button
          )
        }
        // status-toggle：当前为 on 时按钮意为「禁用」，反之为「启用」
        const isOn = row[action.field] === action.onValue
        const label = isOn ? (action.offLabel ?? '禁用') : (action.onLabel ?? '启用')
        const translatedLabel = t(label)
        const button = (
          <Tooltip key="status-toggle">
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={translatedLabel}
                disabled={toggleMutation.isPending}
                onClick={() => setToggling({ row, action, label })}
              >
                <Power className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{translatedLabel}</TooltipContent>
          </Tooltip>
        )
        return action.perm ? (
          <Perm key="status-toggle" perm={action.perm}>
            {button}
          </Perm>
        ) : (
          button
        )
      })}
    </>
  )

  const deletingDisplay = deleting
    ? String(deleting[schema.deleteNameKey ?? rowKey] ?? rowIdOf(deleting, rowKey))
    : ''
  const togglingDisplay = toggling
    ? String(toggling.row[schema.deleteNameKey ?? rowKey] ?? rowIdOf(toggling.row, rowKey))
    : ''

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t(schema.title)}</h1>
          {schema.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{t(schema.description)}</p>
          )}
        </div>
        {schema.createPerm && schema.form && (
          <Perm perm={schema.createPerm}>
            <Button size="sm" onClick={() => setDialog({ mode: 'create', row: null })}>
              <Plus className="size-4" />
              {schema.createLabel ? t(schema.createLabel) : t('create', { entity })}
            </Button>
          </Perm>
        )}
      </div>

      {schema.search && schema.search.length > 0 && (
        <DynaSearch
          fields={schema.search}
          values={draftSearch}
          onChange={(name, value) => setDraftSearch((draft) => ({ ...draft, [name]: value }))}
          onSearch={() => {
            setPage(1)
            setAppliedSearch({ ...draftSearch })
          }}
          onReset={() => {
            setDraftSearch({})
            setAppliedSearch({})
            setPage(1)
          }}
        />
      )}

      <DynaTable
        columns={schema.columns}
        rows={data?.list}
        loading={isLoading}
        rowKey={rowKey}
        actions={(schema.rowActions ?? []).length > 0 ? renderActions : undefined}
        page={page}
        size={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1)
          setPageSize(size)
        }}
      />

      {schema.form && (
        <DynaForm
          config={schema.form}
          mode={dialog?.mode ?? 'create'}
          open={dialog !== null}
          initialRow={dialog?.row ?? null}
          submitting={saveMutation.isPending}
          onOpenChange={(open) => !open && setDialog(null)}
          onSubmit={(body) =>
            dialog &&
            saveMutation.mutate({
              body,
              mode: dialog.mode,
              id: dialog.row ? rowIdOf(dialog.row, rowKey) : undefined,
            })
          }
        />
      )}

      <DynaDetail
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={schema.detail?.title ?? `${schema.entityName ?? '记录'}详情`}
        description={schema.detail?.description}
        fields={schema.detail?.fields ?? schema.columns}
        record={viewing}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleting(null)}
      >
        <AlertDialogContent>
          <MotionSequence className="contents">
            <MotionSequenceItem>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('确认删除')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('deleteHint', { entity, name: deletingDisplay })}
                </AlertDialogDescription>
              </AlertDialogHeader>
            </MotionSequenceItem>
            <MotionSequenceItem>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteMutation.isPending}>
                  {t('取消')}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    if (deleting) deleteMutation.mutate(rowIdOf(deleting, rowKey))
                  }}
                >
                  {deleteMutation.isPending && <PixelScale variant="inline" tone="current" />}
                  {deleteMutation.isPending ? t('删除中…') : t('确认删除')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </MotionSequenceItem>
          </MotionSequence>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && !toggleMutation.isPending && setToggling(null)}
      >
        <AlertDialogContent>
          <MotionSequence className="contents">
            <MotionSequenceItem>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('confirmToggle', { action: toggling ? t(toggling.label) : '' })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('toggleHint', {
                    action: toggling ? t(toggling.label) : '',
                    entity,
                    name: togglingDisplay,
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
            </MotionSequenceItem>
            <MotionSequenceItem>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={toggleMutation.isPending}>
                  {t('取消')}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={toggleMutation.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    if (toggling) handleToggle(toggling.row, toggling.action)
                  }}
                >
                  {toggleMutation.isPending && <PixelScale variant="inline" tone="current" />}
                  {toggleMutation.isPending ? t('处理中…') : toggling ? t(toggling.label) : ''}
                </AlertDialogAction>
              </AlertDialogFooter>
            </MotionSequenceItem>
          </MotionSequence>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
