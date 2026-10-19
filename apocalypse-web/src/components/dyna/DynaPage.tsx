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

import { isCancelledError, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  KeyRound,
  LayoutDashboard,
  LayoutList,
  List,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { PageHeader } from '@/components/layout/PageHeader'
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
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PixelScale } from '@/effects/PixelWave'
import { ApiError, assertPermissionAccess } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { ModuleAccess } from '@/lib/query/ModuleAccess'
import type { ModuleOperation, ModuleScope } from '@/lib/query/module-scope'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { useStableCallback } from '@/hooks/useStableCallback'
import { createDynaQueries } from './dyna-queries'

import { DynaDetail } from './DynaDetail'
import { DynaForm, type DynaFormProps } from './DynaForm'
import { DynaSearch } from './DynaSearch'
import { DynaTable } from './DynaTable'
import {
  validatePageSchema,
  type DynaActionIcon,
  type DynaPageSchema,
  type DynaStatusToggleAction,
} from './schema'
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
  queryScope?: ModuleScope
  /** Page-owned server option loading; default forms keep the schema renderer. */
  formComponent?: ComponentType<DynaFormProps>
  /**
   * custom 行操作的 handler 注册表：action.key → 点击回调（拿到整行数据）。
   * 越出标准 CRUD 的行级动作（授权弹窗、跳转等）由页面经此注入；
   * schema 里声明了 custom 但未注册 handler 的 key 渲染为禁用按钮（失配可见）。
   */
  customActions?: Record<string, ((row: Row) => void) | ScopedDynaAction>
  /**
   * Optional overview workspace (insight cards, distributions). On desktop the header offers a
   * List | Overview switch; the list view stays the classic search + table and never mixes in
   * overview surfaces. Queries should nest under `controls.queryKey` so page refresh, writes and
   * resource denial reach them too.
   */
  overview?: (controls: DynaOverviewControls) => ReactNode
  /** A page-owned view switch shown in the header slot (e.g. role graph | list). */
  headerView?: ReactNode
  /**
   * Section inside a page that already has its PageHeader (e.g. a dictionary tab): no title or
   * outer padding, only a toolbar with refresh and create.
   */
  embedded?: boolean
}

const ACTION_ICONS: Record<DynaActionIcon, LucideIcon> = {
  view: Eye,
  power: Power,
  permissions: KeyRound,
  navigation: LayoutList,
  members: Users,
}

type DynaView = 'list' | 'overview'
const DYNA_VIEWS = ['list', 'overview'] as const

export interface DynaOverviewControls {
  /** Applied search values (what the table currently shows). */
  filters: Readonly<Record<string, string>>
  /** Replaces the search (draft and applied), returns to page 1 and shows the list view. */
  applyFilters: (values: Record<string, string>) => void
  /**
   * Prefix for overview queries (`[...queryKey, ...]`): nested under the page key so writes and
   * resource denial reach them, and refreshed by the page refresh button. Undefined for
   * module-scoped pages, whose filters are not key-based.
   */
  queryKey: readonly unknown[] | undefined
}

export interface ScopedDynaAction {
  operation: ModuleOperation<[Row], unknown>
  onSuccess?: (result: unknown, row: Row) => void
}

export function DynaPage(props: DynaPageProps) {
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const queries = useMemo(
    () => createDynaQueries(props.schema, props.queryScope),
    [props.schema, props.queryScope],
  )
  const key = JSON.stringify([
    sessionEpoch,
    authorizationEpoch,
    props.queryScope?.moduleKey,
    props.schema.endpoint,
    props.schema.key,
  ])
  // The view is not part of the key: switching views keeps paging, filters and open layers.
  const render = (view: DynaView, onViewChange?: (view: DynaView) => void) => (
    <DynaPageContent
      key={key}
      {...props}
      queries={queries}
      view={view}
      onViewChange={onViewChange}
    />
  )
  const content = props.overview ? <DynaPageViews>{render}</DynaPageViews> : render('list')
  return props.queryScope ? (
    <ModuleAccess scope={props.queryScope}>{content}</ModuleAccess>
  ) : (
    content
  )
}

/** Overview is a desktop workspace; narrow screens keep the list only. */
function DynaPageViews({
  children,
}: {
  children: (view: DynaView, onViewChange?: (view: DynaView) => void) => ReactNode
}) {
  const desktop = useDesktopViewport()
  const [view, setView] = usePageView(DYNA_VIEWS)
  return children(desktop ? view : 'list', desktop ? setView : undefined)
}

function DynaPageContent({
  schema,
  customActions,
  queryScope,
  queries,
  overview,
  headerView,
  embedded = false,
  view,
  onViewChange,
  formComponent: FormComponent = DynaForm,
}: DynaPageProps & {
  queries: ReturnType<typeof createDynaQueries>
  view: DynaView
  onViewChange?: (view: DynaView) => void
}) {
  const t = useDynaText()
  const { t: commonText } = useTranslation()
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
  const [mutationDenial, setMutationDenial] = useState<ApiError | null>(null)

  const { data, isLoading, isFetching, error, refetch } = useQuery<PageResult<Row>>(
    queries.list(
      {
        schemaKey: schema.key,
        endpoint: schema.endpoint,
        page,
        size: pageSize,
        search: appliedSearch,
      },
      validation.success,
    ),
  )

  const invalidate = () => queryClient.invalidateQueries(queries.filter())
  const resourceDenial = useResourceDenial({
    errors: [error],
    clear: queries.filter(),
    reset: () => {
      setDialog(null)
      setViewing(null)
      setDeleting(null)
      setToggling(null)
    },
  })
  const onDenied = {
    isCurrent: resourceDenial.isCurrent,
    handle: (error: Error) => {
      if (!isResourceDenied(error)) return
      setMutationDenial(error)
      resourceDenial.handle(error)
    },
  }
  const pageFilter = queries.filter()
  const overviewKey =
    'queryKey' in pageFilter && pageFilter.queryKey
      ? [...pageFilter.queryKey, 'overview']
      : undefined
  const retryList = async () => {
    const denied = mutationDenial
    if (overview && overviewKey) void queryClient.invalidateQueries({ queryKey: overviewKey })
    const result = await refetch()
    // Cache clearing is not a successful empty result; keep the denial until recovery.
    // A newer denial must not be cleared by an older in-flight retry.
    if (result.isSuccess) setMutationDenial((current) => (current === denied ? null : current))
  }
  // A newer denial cancels an older retry; that cancellation must not hide the real cause.
  const feedbackError =
    mutationDenial && isCancelledError(error) ? mutationDenial : (error ?? mutationDenial)
  const localKey = JSON.stringify([
    page,
    pageSize,
    appliedSearch,
    dialog,
    deleting,
    toggling,
    viewing,
  ])

  const saveMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, input: { body: Row; mode: 'create' | 'edit'; id?: string }) =>
      input.mode === 'create'
        ? run(queries.create, input.body)
        : run(queries.edit, { id: input.id!, body: input.body }),
    onSuccess: (_result, input) => {
      toast.success(t(input.mode === 'create' ? 'created' : 'updated', { entity }))
      setDialog(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorText(error, t('保存失败'))),
  })

  const deleteMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, id: string) => run(queries.remove, id),
    onSuccess: () => {
      toast.success(t('deleted', { entity }))
      setDeleting(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorText(error, t('删除失败'))),
  })

  const toggleMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, input: { id: string; body: Row; action: DynaStatusToggleAction }) => {
      const operation = queries.toggles.get(input.action)
      if (!operation) throw new Error('Unknown Dyna action')
      return run(operation, input)
    },
    onSuccess: () => {
      toast.success(t('操作成功'))
      setToggling(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorText(error, t('操作失败'))),
  })

  const customMutation = useModuleMutation(queryScope, {
    onDenied,
    localKey,
    mutationFn: (run, input: { action: ScopedDynaAction; row: Row }) =>
      run(input.action.operation, input.row),
    onSuccess: (result, input) => input.action.onSuccess?.(result, input.row),
    onError: (error) => toast.error(errorText(error, t('操作失败'))),
  })

  const customPending = customMutation.isPending
  const togglePending = toggleMutation.isPending
  // Stable handlers keep the memoised table and its rows from re-rendering when a layer opens.
  const runCustom = useStableCallback((action: ScopedDynaAction, row: Row) =>
    customMutation.mutate({ action, row }),
  )
  const retryTable = useStableCallback(() => void retryList())
  const resetFilters = useCallback(() => {
    setDraftSearch({})
    setAppliedSearch({})
    setPage(1)
  }, [])
  const changePageSize = useCallback((size: number) => {
    setPage(1)
    setPageSize(size)
  }, [])
  // The row a layer was opened from stays marked while that layer is open.
  const activeRow = viewing ?? dialog?.row ?? deleting ?? toggling?.row ?? null
  const activeRowKey = activeRow ? String(activeRow[rowKey] ?? '') : null
  const renderActions = useCallback(
    (row: Row) => (
      <>
        {(schema.rowActions ?? []).map((action) => {
          if (action.kind === 'view') {
            const label = action.label
              ? t(action.label)
              : commonText('common.查看', { defaultValue: '查看' })
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
              <Perm key="view" perm={action.perm} requiresAllScope={action.requiresAllScope}>
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
              <Perm key="edit" perm={action.perm} requiresAllScope={action.requiresAllScope}>
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
              <Perm key="delete" perm={action.perm} requiresAllScope={action.requiresAllScope}>
                {button}
              </Perm>
            ) : (
              button
            )
          }
          // custom：文案按钮，点击调页面注入的 handler；未注册 handler 时禁用（失配可见）
          if (action.kind === 'custom') {
            const handler = customActions?.[action.key]
            const Icon = action.icon ? ACTION_ICONS[action.icon] : null
            const control = (
              <Button
                key={`custom-${action.key}`}
                variant="ghost"
                size={Icon ? 'icon' : 'sm'}
                aria-label={t(action.label)}
                disabled={
                  !handler ||
                  (queryScope !== undefined && typeof handler === 'function') ||
                  customPending
                }
                onClick={() => {
                  if (typeof handler === 'function' && !queryScope) {
                    try {
                      assertPermissionAccess(
                        action.perm ? [action.perm] : [],
                        action.requiresAllScope && action.perm ? [action.perm] : [],
                      )
                      handler(row)
                    } catch {
                      /* An obsolete action cannot reopen an editor. */
                    }
                  } else if (handler && typeof handler !== 'function') runCustom(handler, row)
                }}
              >
                {Icon ? <Icon className="size-3.5" /> : t(action.label)}
              </Button>
            )
            const button = Icon ? (
              <Tooltip key={`custom-${action.key}`}>
                <TooltipTrigger asChild>{control}</TooltipTrigger>
                <TooltipContent>{t(action.label)}</TooltipContent>
              </Tooltip>
            ) : (
              control
            )
            return action.perm ? (
              <Perm
                key={`custom-${action.key}`}
                perm={action.perm}
                requiresAllScope={action.requiresAllScope}
              >
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
                  disabled={togglePending}
                  onClick={() => setToggling({ row, action, label })}
                >
                  <Power className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{translatedLabel}</TooltipContent>
            </Tooltip>
          )
          return action.perm ? (
            <Perm key="status-toggle" perm={action.perm} requiresAllScope={action.requiresAllScope}>
              {button}
            </Perm>
          ) : (
            button
          )
        })}
      </>
    ),
    [
      schema.rowActions,
      t,
      commonText,
      customActions,
      queryScope,
      customPending,
      togglePending,
      runCustom,
    ],
  )

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
    toggleMutation.mutate({ id: rowIdOf(row, rowKey), body, action })
  }

  const deletingDisplay = deleting
    ? String(deleting[schema.deleteNameKey ?? rowKey] ?? rowIdOf(deleting, rowKey))
    : ''
  const togglingDisplay = toggling
    ? String(toggling.row[schema.deleteNameKey ?? rowKey] ?? rowIdOf(toggling.row, rowKey))
    : ''

  const viewControl = onViewChange ? (
    <SegmentedControl
      label={t('pageView')}
      value={view}
      onChange={onViewChange}
      options={[
        { value: 'list', label: t('viewList'), icon: List },
        { value: 'overview', label: t('viewOverview'), icon: LayoutDashboard },
      ]}
    />
  ) : (
    headerView
  )

  const headerActions = (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label={t('queryRefresh')}
        onClick={() => void retryList()}
        disabled={isFetching}
      >
        <RefreshCw className="size-4" />
      </Button>
      {schema.createPerm && schema.form && (
        <Perm perm={schema.createPerm} requiresAllScope={schema.createRequiresAllScope}>
          <Button onClick={() => setDialog({ mode: 'create', row: null })}>
            <Plus className="size-4" />
            {schema.createLabel ? t(schema.createLabel) : t('create', { entity })}
          </Button>
        </Perm>
      )}
    </>
  )

  return (
    <div className={cn('w-full min-w-0 space-y-6', !embedded && 'p-4 sm:p-6')}>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {schema.description ? (
            <p className="text-sm text-muted-foreground">{t(schema.description)}</p>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        </div>
      ) : (
        <PageHeader
          title={t(schema.title)}
          description={schema.description ? t(schema.description) : undefined}
          view={viewControl}
          actions={headerActions}
        />
      )}

      {view === 'overview' && overview ? (
        overview({
          filters: appliedSearch,
          applyFilters: (values) => {
            setDraftSearch({ ...values })
            setAppliedSearch({ ...values })
            setPage(1)
            onViewChange?.('list')
          },
          queryKey: overviewKey,
        })
      ) : (
        <>
          {schema.search && schema.search.length > 0 && (
            <DynaSearch
              fields={schema.search}
              values={draftSearch}
              onChange={(name, value) => setDraftSearch((draft) => ({ ...draft, [name]: value }))}
              onSearch={() => {
                setPage(1)
                setAppliedSearch({ ...draftSearch })
              }}
              onReset={resetFilters}
            />
          )}

          <DynaTable
            columns={schema.columns}
            rows={data?.list}
            loading={isLoading}
            error={feedbackError}
            refreshing={isFetching}
            onRetry={retryTable}
            filtered={Object.values(appliedSearch).some((value) => value.trim().length > 0)}
            onResetFilters={resetFilters}
            rowKey={rowKey}
            actions={(schema.rowActions ?? []).length > 0 ? renderActions : undefined}
            page={page}
            size={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
            activeRowKey={activeRowKey}
          />
        </>
      )}

      {schema.form && (
        <FormComponent
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
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteHint', { entity, name: deletingDisplay })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t('取消')}</AlertDialogCancel>
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
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && !toggleMutation.isPending && setToggling(null)}
      >
        <AlertDialogContent>
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleMutation.isPending}>{t('取消')}</AlertDialogCancel>
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
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
