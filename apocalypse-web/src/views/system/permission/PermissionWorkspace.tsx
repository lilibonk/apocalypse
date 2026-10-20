/** Module → resource → registered action, using the catalog's existing query and edit contract. */
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Layers3, ShieldCheck } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { DynaWorkspaceControls } from '@/components/dyna'
import { DynaCollection } from '@/components/dyna/DynaCollection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AnimatedNumber } from '@/components/insights/AnimatedNumber'
import { motionGeometry, motionTransition, stateMotion, insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useAuthStore } from '@/stores/auth'
import { getAuthorizationOverview } from '../role/authorization-insight.api'
import { canAskAuthorizationQuestions } from '../role/authorization-questions.model'
import '../shared/object-workspace.css'
import { ObjectWorkspacePanels } from '../shared/ObjectWorkspacePanels'

const value = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? '' : String(row[key])

export function PermissionWorkspace(controls: DynaWorkspaceControls) {
  const { t, i18n } = useTranslation('system')
  const enabled = useMotionPreference()
  const id = useId()
  const canOverview = useAuthStore(canAskAuthorizationQuestions)
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const overview = useQuery({
    queryKey: [...(controls.queryKey ?? ['system', 'permissions', 'summary']), epoch, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })
  const { collection, filters, applyFilters, selectedRowKey, selectRow } = controls
  const activeModule = filters.moduleKey ?? ''
  const modules = overview.isError ? [] : (overview.data?.permissionModules ?? [])
  return (
    <div className="object-workspace space-y-4" data-object-workspace="permissions">
      <div className="object-workspace-toolbar">
        <div className="min-w-0 space-y-2">
          <div className="object-workspace-path">
            <Layers3 className="size-4" aria-hidden="true" />
            <span>{activeModule || t('objectWorkspace.allModules')}</span>
            <ChevronRight className="size-4" />
            <span>{t('objectWorkspace.resources')}</span>
            <ChevronRight className="size-4" />
            <span className="font-medium text-foreground">{t('objectWorkspace.actions')}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('objectWorkspace.catalogScope')}</p>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {collection.rows === undefined || collection.error ? (
              '—'
            ) : (
              <AnimatedNumber
                value={collection.total}
                variant="odometer"
                language={i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'}
              />
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('objectWorkspace.matchingDefinitions')}
          </span>
        </p>
      </div>
      {modules.length > 0 && (
        <div
          role="group"
          aria-label={t('objectWorkspace.modules')}
          className="flex flex-wrap gap-2"
        >
          <Button
            size="sm"
            variant={!activeModule ? 'secondary' : 'outline'}
            aria-pressed={!activeModule}
            onClick={() => applyFilters({ ...filters, moduleKey: '', resource: '' })}
          >
            {t('objectWorkspace.allModules')}
          </Button>
          {modules.map((module) =>
            module.key ? (
              <Button
                key={module.key}
                size="sm"
                variant={activeModule === module.key ? 'secondary' : 'outline'}
                aria-pressed={activeModule === module.key}
                onClick={() =>
                  applyFilters({
                    ...filters,
                    moduleKey: activeModule === module.key ? '' : module.key!,
                    resource: '',
                  })
                }
              >
                <span>{module.key}</span>
                <span className="tabular-nums text-muted-foreground">{module.count}</span>
                {!module.enabled && (
                  <span className="text-xs">{t('listInsights.permissions.moduleDisabled')}</span>
                )}
              </Button>
            ) : (
              <span
                key="core"
                className="inline-flex items-center gap-2 rounded-control border px-3 text-xs text-muted-foreground"
                title={t('listInsights.permissions.coreUnfilterable')}
              >
                {t('objectWorkspace.core')} <span className="tabular-nums">{module.count}</span>
              </span>
            ),
          )}
        </div>
      )}
      {controls.search}
      <DynaCollection collection={collection}>
        {(rows) => {
          const selected =
            rows.find((row) => value(row, collection.rowKey) === selectedRowKey) ?? rows[0]!
          const selectedId = value(selected, collection.rowKey)
          const resources = new Map<string, Record<string, unknown>[]>()
          rows.forEach((row) => {
            const key = `${value(row, 'moduleKey')}:${value(row, 'resource')}`
            resources.set(key, [...(resources.get(key) ?? []), row])
          })
          const scopes = Array.isArray(selected.supportedScopeOverrides)
            ? selected.supportedScopeOverrides
            : []
          return (
            <LayoutGroup id={id}>
              <ObjectWorkspacePanels
                title={t('objectWorkspace.definitionDetails')}
                context={value(selected, 'name')}
                inspector={
                  <>
                    <p className="text-xs text-muted-foreground">
                      {t('objectWorkspace.definitionDetails')}
                    </p>
                    <div>
                      <h2 className="break-words text-lg font-semibold">
                        {value(selected, 'name')}
                      </h2>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {value(selected, 'code')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={Number(selected.status) === 1 ? 'success' : 'secondary'}>
                        {t(
                          Number(selected.status) === 1
                            ? 'authorization.active'
                            : 'authorization.inactive',
                        )}
                      </Badge>
                      <Badge variant="secondary">
                        {t(`authorization.${value(selected, 'lifecycle')}`)}
                      </Badge>
                      <Badge variant="outline">
                        {t(
                          selected.registered
                            ? 'objectWorkspace.registered'
                            : 'objectWorkspace.historical',
                        )}
                      </Badge>
                    </div>
                    <motion.div
                      key={`${selectedId}:${value(selected, 'version')}`}
                      initial={
                        enabled
                          ? { opacity: stateMotion.dimOpacity, y: motionGeometry.pageOffset }
                          : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={enabled ? motionTransition.standard : insightMotion.instant}
                      className="space-y-4 rounded-control bg-muted p-3"
                    >
                      <p className="text-sm leading-relaxed break-words">
                        {value(selected, 'description') || t('objectWorkspace.noDescription')}
                      </p>
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.references')}
                          </dt>
                          <dd className="mt-1 tabular-nums">
                            {value(selected, 'referenceRoleCount') || '0'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {t('objectWorkspace.version')}
                          </dt>
                          <dd className="mt-1 tabular-nums">{value(selected, 'version') || '—'}</dd>
                        </div>
                      </dl>
                    </motion.div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t('objectWorkspace.supportedScopes')}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">
                        {scopes.length
                          ? scopes.map((scope) => t(`authorization.${String(scope)}`)).join(' · ')
                          : t('objectWorkspace.noScopes')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 border-t border-border-subtle pt-3">
                      {collection.actions?.(selected)}
                    </div>
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        {t('objectWorkspace.declaration')}
                      </summary>
                      <p className="mt-2 break-all font-mono">
                        {value(selected, 'declarationSource') || '—'}
                      </p>
                    </details>
                  </>
                }
              >
                {(inspect) => (
                  <>
                    <div className="space-y-3 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {t('objectWorkspace.pageResources')} ·{' '}
                        {t('objectWorkspace.currentPage', { count: rows.length })}
                      </p>
                      {[...resources].map(([key, actions]) => {
                        const resource = actions[0]!
                        return (
                          <motion.section
                            key={key}
                            layout={enabled ? 'position' : false}
                            transition={enabled ? stateMotion.yieldLayout : insightMotion.instant}
                            className="rounded-panel border border-border-subtle bg-card p-4 shadow-surface"
                          >
                            <div className="object-workspace-path mb-3">
                              <span>
                                {value(resource, 'moduleKey') || t('objectWorkspace.core')}
                              </span>
                              <ChevronRight className="size-3.5" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto min-w-0 px-1 py-0 font-medium text-foreground"
                                aria-label={t('objectWorkspace.resourceFilter', {
                                  name: value(resource, 'resource'),
                                })}
                                onClick={() =>
                                  applyFilters({
                                    ...filters,
                                    resource: value(resource, 'resource'),
                                  })
                                }
                              >
                                {value(resource, 'resource') || '—'}
                              </Button>
                              <span className="ml-auto tabular-nums">{actions.length}</span>
                            </div>
                            <div className="space-y-2">
                              {actions.map((action) => {
                                const key = value(action, collection.rowKey)
                                const active = key === selectedId
                                return (
                                  <motion.button
                                    layout={enabled ? 'position' : false}
                                    transition={
                                      enabled ? motionTransition.standard : insightMotion.instant
                                    }
                                    key={key}
                                    type="button"
                                    aria-pressed={active}
                                    aria-label={t('objectWorkspace.selectAction', {
                                      name: value(action, 'name'),
                                    })}
                                    onClick={() => {
                                      selectRow(key)
                                      inspect()
                                    }}
                                    className="object-workspace-card object-workspace-select object-workspace-action"
                                    data-selected={active}
                                  >
                                    <ShieldCheck
                                      className="size-5 shrink-0 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-medium">
                                        {value(action, 'name')}
                                      </p>
                                      <p className="truncate font-mono text-xs text-muted-foreground">
                                        {value(action, 'code')}
                                      </p>
                                    </div>
                                    <Badge
                                      variant={
                                        Number(action.status) === 1 ? 'success' : 'secondary'
                                      }
                                    >
                                      {t(
                                        Number(action.status) === 1
                                          ? 'authorization.active'
                                          : 'authorization.inactive',
                                      )}
                                    </Badge>
                                    <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                                  </motion.button>
                                )
                              })}
                            </div>
                          </motion.section>
                        )
                      })}
                    </div>
                  </>
                )}
              </ObjectWorkspacePanels>
            </LayoutGroup>
          )
        }}
      </DynaCollection>
    </div>
  )
}
