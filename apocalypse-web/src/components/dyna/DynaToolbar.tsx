import {
  Download,
  Eye,
  KeyRound,
  LayoutList,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Perm } from '@/components/Perm'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { assertPermissionAccess } from '@/lib/api/client'
import type { ModuleScope } from '@/lib/query/module-scope'
import { DynaSearch } from './DynaSearch'
import type { DynaActionIcon, DynaPageSchema } from './schema'
import type {
  DynaController,
  DynaDialogModeState,
  DynaRow,
  DynaToggleState,
  ScopedDynaAction,
} from './use-dyna-controller'
import { useDynaText } from './use-dyna'

const ACTION_ICONS: Record<DynaActionIcon, LucideIcon> = {
  view: Eye,
  power: Power,
  permissions: KeyRound,
  navigation: LayoutList,
  members: Users,
}

export interface RenderDynaRowActionsOptions {
  row: DynaRow
  schema: DynaPageSchema
  t: ReturnType<typeof useDynaText>
  commonText: (key: string, options?: Record<string, unknown>) => string
  customActions?: Record<string, ((row: DynaRow) => void) | ScopedDynaAction>
  queryScope?: ModuleScope
  customPending: boolean
  togglePending: boolean
  runCustom: (action: ScopedDynaAction, row: DynaRow) => void
  setViewing: (row: DynaRow | null) => void
  setDialog: (next: DynaDialogModeState | null) => void
  setDeleting: (row: DynaRow | null) => void
  setToggling: (next: DynaToggleState | null) => void
}

export function renderDynaRowActions({
  row,
  schema,
  t,
  commonText,
  customActions,
  queryScope,
  customPending,
  togglePending,
  runCustom,
  setViewing,
  setDialog,
  setDeleting,
  setToggling,
}: RenderDynaRowActionsOptions): ReactNode {
  return (
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
                  onClick={(event) => {
                    event?.stopPropagation()
                    setViewing(row)
                  }}
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
                  onClick={(event) => {
                    event?.stopPropagation()
                    setDialog({ mode: 'edit', row })
                  }}
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
                  onClick={(event) => {
                    event?.stopPropagation()
                    setDeleting(row)
                  }}
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
              onClick={(event) => {
                event?.stopPropagation()
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
                onClick={(event) => {
                  event?.stopPropagation()
                  setToggling({ row, action, label })
                }}
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
  )
}

export interface DynaToolbarActionsProps {
  controller: DynaController
}

/**
 * Reusable header/toolbar action buttons (Refresh, Batch Delete, CSV Import, CSV Export, Create)
 * driven by a headless `DynaController`.
 */
export function DynaToolbarActions({ controller }: DynaToolbarActionsProps) {
  const t = useDynaText()
  const { t: commonText } = useTranslation()
  const { schema, entity, collection, selectedKeys, actions, dialogs } = controller

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label={t('queryRefresh')}
        onClick={() => void actions.retry()}
        disabled={collection.isFetching}
      >
        <RefreshCw className="size-4" />
      </Button>
      {selectedKeys.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => controller.setSelectedKeys([])}
        >
          {t('clearSelection')}
        </Button>
      )}
      {schema.batchDeletePerm && selectedKeys.length > 0 && (
        <Perm perm={schema.batchDeletePerm}>
          <Button
            variant="destructive"
            onClick={() => actions.requestBatchDelete()}
            disabled={dialogs.batchDeletePending}
          >
            <Trash2 className="size-4" />
            {t('batchDeleteCount', { count: selectedKeys.length })}
          </Button>
        </Perm>
      )}
      {schema.importPerm && (
        <Perm perm={schema.importPerm}>
          <Button variant="outline" onClick={actions.openImport}>
            <Upload className="size-4" />
            {commonText('common.导入CSV', { defaultValue: '导入 CSV' })}
          </Button>
        </Perm>
      )}
      {schema.exportPerm && (
        <Perm perm={schema.exportPerm}>
          <Button
            variant="outline"
            onClick={actions.triggerExport}
            disabled={dialogs.exportPending}
          >
            <Download className="size-4" />
            {commonText('common.导出CSV', { defaultValue: '导出 CSV' })}
          </Button>
        </Perm>
      )}
      {schema.createPerm && schema.form && (
        <Perm perm={schema.createPerm} requiresAllScope={schema.createRequiresAllScope}>
          <Button onClick={() => actions.openCreate(null)}>
            <Plus className="size-4" />
            {schema.createLabel ? t(schema.createLabel) : t('create', { entity })}
          </Button>
        </Perm>
      )}
    </>
  )
}

export interface DynaToolbarProps {
  controller: DynaController
  presentation?: 'panel' | 'toolbar'
}

/**
 * Standalone search bar bound to a headless `DynaController`.
 */
export function DynaToolbar({ controller, presentation = 'panel' }: DynaToolbarProps) {
  const { schema, filters, draftSearch, setDraftSearchField, submitDraftSearch, resetFilters } =
    controller
  if (!schema.search || schema.search.length === 0) return null

  return (
    <DynaSearch
      presentation={presentation}
      fields={schema.search}
      values={draftSearch}
      appliedValues={filters}
      onChange={setDraftSearchField}
      onSearch={submitDraftSearch}
      onReset={resetFilters}
    />
  )
}
