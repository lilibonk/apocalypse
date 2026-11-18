/**
 * DynaPage：基于 Headless `useDynaController` + `DynaToolbar` + `DynaTable` + `DynaDialogs` 的轻量标准表格页封装。
 *
 * 空间工作台（Slice 02 / Slice 03）应直接调用 `useDynaController(schema, options)` 并组合
 * `SpatialStage` / `StickyCompactRailLayout` + `DynaDialogs`。
 */

import { useMemo, type ComponentType, type ReactNode } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import type { EntityRouteIntent } from '@/components/navigation/entity-intent'
import { ModuleAccess } from '@/lib/query/ModuleAccess'
import type { ModuleScope } from '@/lib/query/module-scope'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { createDynaQueries } from './dyna-queries'
import { renderDynaDialogs } from './DynaDialogs'
import { DynaForm, type DynaAsyncFieldValidator, type DynaFormProps } from './DynaForm'
import { DynaTable } from './DynaTable'
import { DynaToolbar, DynaToolbarActions } from './DynaToolbar'
import type { DynaPageSchema } from './schema'
import { useDynaController, type DynaRow, type ScopedDynaAction } from './use-dyna-controller'
import { useDynaText } from './use-dyna'

export type { ScopedDynaAction }

export interface DynaPageProps {
  schema: DynaPageSchema
  queryScope?: ModuleScope
  /** Page-owned server option loading; default forms keep the schema renderer. */
  formComponent?: ComponentType<DynaFormProps>
  /** Optional field-level async validators (e.g. uniqueness check on blur/debounce/submit). */
  asyncValidators?: Record<string, DynaAsyncFieldValidator>
  /**
   * custom 行操作的 handler 注册表：action.key → 点击回调（拿到整行数据）。
   */
  customActions?: Record<string, ((row: DynaRow) => void) | ScopedDynaAction>
  /** Navigation context is only a search hint; all data still comes through the guarded query. */
  entryContext?: { key: string; filters: Record<string, string>; selectedRowKey?: string }
  /** Cross-page EntityPill route intent hint. */
  entityIntent?: EntityRouteIntent
  /** A page-owned view switch shown in the header slot (e.g. role graph | list). */
  headerView?: ReactNode
  /**
   * Section inside a page that already has its PageHeader: no title or outer padding.
   */
  embedded?: boolean
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
    props.entryContext?.key,
    props.entityIntent?.id,
  ])

  const content = <DynaPageContent key={key} {...props} queries={queries} />

  return props.queryScope ? (
    <ModuleAccess scope={props.queryScope}>{content}</ModuleAccess>
  ) : (
    content
  )
}

function DynaPageContent({
  schema,
  customActions,
  queryScope,
  queries,
  headerView,
  embedded = false,
  entryContext,
  entityIntent,
  formComponent = DynaForm,
  asyncValidators,
}: DynaPageProps & {
  queries: ReturnType<typeof createDynaQueries>
}) {
  const t = useDynaText()

  const controller = useDynaController(schema, {
    queryScope,
    queries,
    embedded,
    entryContext,
    entityIntent,
    customActions,
  })

  const { validation, collection } = controller

  if (!validation.success) {
    return (
      <div className="w-full space-y-5 p-4 sm:p-6">
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

  const headerActions = <DynaToolbarActions controller={controller} />
  const searchControl = <DynaToolbar controller={controller} presentation="panel" />

  return (
    <div className={cn('w-full min-w-0 space-y-5', !embedded && 'p-4 sm:p-6')}>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        </div>
      ) : (
        <PageHeader title={t(schema.title)} view={headerView} actions={headerActions} />
      )}

      {searchControl}
      <DynaTable {...collection} />

      {renderDynaDialogs({
        controller,
        formComponent,
        asyncValidators,
        t,
      })}
    </div>
  )
}
