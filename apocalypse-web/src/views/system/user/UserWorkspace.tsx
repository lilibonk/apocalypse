/** Account objects share DynaPage's schema, queries and guarded forms; no duplicate CRUD state. */
import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronRight, CircleUserRound, ShieldCheck } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DictTag } from '@/components/DictTag'
import { DynaCollection } from '@/components/dyna/DynaCollection'
import type { DynaWorkspaceControls } from '@/components/dyna'
import { AnimatedNumber } from '@/components/insights/AnimatedNumber'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { stateMotion, motionTransition, motionGeometry, insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useMenuRoute } from '@/hooks/useMenuRoute'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/lib/api/client'
import { getAuthorizationOverview } from '../role/authorization-insight.api'
import { canAskAuthorizationQuestions } from '../role/authorization-questions.model'
import '../shared/object-workspace.css'
import { ObjectWorkspacePanels } from '../shared/ObjectWorkspacePanels'

const value = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? '' : String(row[key])

export function UserWorkspace(controls: DynaWorkspaceControls) {
  const { t, i18n } = useTranslation('system')
  const motionEnabled = useMotionPreference()
  const layoutId = useId()
  const canOverview = useAuthStore(canAskAuthorizationQuestions)
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const roleRoute = useMenuRoute('system/role')
  const [rosterOpen, setRosterOpen] = useState(false)
  const overview = useQuery({
    queryKey: [...(controls.queryKey ?? ['system', 'users', 'summary']), epoch, 'overview'],
    queryFn: ({ signal }) => getAuthorizationOverview(signal),
    enabled: canOverview,
  })
  const { collection, selectedRowKey, selectRow } = controls
  return (
    <div className="object-workspace space-y-4" data-object-workspace="users">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-baseline gap-2" title={t('objectWorkspace.accountScope')}>
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
          <span className="text-sm text-muted-foreground">
            {t('objectWorkspace.matchingAccounts')}
          </span>
        </p>
        {canOverview && overview.data?.usersVisible && !overview.isError && (
          <Button variant="secondary" size="sm" onClick={() => setRosterOpen(true)}>
            <ShieldCheck className="size-4" />
            {t('objectWorkspace.withoutRoles')}{' '}
            <span className="tabular-nums">{overview.data.usersWithoutRolesCount}</span>
          </Button>
        )}
      </div>
      {controls.search}
      <DynaCollection collection={collection}>
        {(rows) => {
          const selected =
            rows.find((row) => value(row, collection.rowKey) === selectedRowKey) ?? rows[0]!
          const selectedId = value(selected, collection.rowKey)
          const name = value(selected, 'nickname') || value(selected, 'username')
          return (
            <LayoutGroup id={layoutId}>
              <ObjectWorkspacePanels
                title={t('objectWorkspace.accountDetails')}
                context={name}
                inspector={
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t('objectWorkspace.accountDetails')}
                      </span>
                      <DictTag type="sys_user_status" value={String(selected.status)} />
                    </div>
                    <div>
                      <h2 className="break-words text-xl font-semibold">{name}</h2>
                      <p className="break-all text-sm text-muted-foreground">
                        {value(selected, 'username')}
                      </p>
                    </div>
                    <div className="object-workspace-path">
                      <span>{t('objectWorkspace.account')}</span>
                      <ChevronRight className="size-4" />
                      <span>{t('objectWorkspace.department')}</span>
                    </div>
                    <motion.div
                      key={`${selectedId}:${value(selected, 'deptId')}:${value(selected, 'status')}`}
                      initial={
                        motionEnabled
                          ? { opacity: stateMotion.dimOpacity, y: motionGeometry.pageOffset }
                          : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={motionEnabled ? motionTransition.standard : insightMotion.instant}
                      className="rounded-control bg-muted p-3"
                    >
                      <p className="flex items-center gap-2 font-medium">
                        <Building2 className="size-4" aria-hidden="true" />
                        {value(selected, 'deptName') || t('objectWorkspace.unspecified')}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t('objectWorkspace.created')}
                      </p>
                      <p className="mt-1 text-sm tabular-nums">
                        {value(selected, 'createTime').replace('T', ' ') || '—'}
                      </p>
                    </motion.div>
                    <div className="flex flex-wrap gap-1">{collection.actions?.(selected)}</div>
                    {roleRoute && (
                      <div className="space-y-2 border-t border-border-subtle pt-4">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            to={roleRoute}
                            state={{
                              workspaceContext: {
                                kind: 'member',
                                userId: selectedId,
                                keyword: value(selected, 'username'),
                              },
                            }}
                          >
                            <ShieldCheck className="size-4" />
                            {t('objectWorkspace.manageRoles')}
                          </Link>
                        </Button>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t('objectWorkspace.roleBoundary')}
                        </p>
                      </div>
                    )}
                  </>
                }
              >
                {(inspect) => (
                  <>
                    <div className="space-y-3 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {t('objectWorkspace.currentPage', { count: rows.length })}
                      </p>
                      <div
                        className="object-workspace-items"
                        aria-label={t('objectWorkspace.account')}
                      >
                        {rows.map((row) => {
                          const id = value(row, collection.rowKey)
                          const active = id === selectedId
                          const label = value(row, 'nickname') || value(row, 'username')
                          return (
                            <motion.article
                              key={id}
                              layout={motionEnabled ? 'position' : false}
                              transition={
                                motionEnabled ? stateMotion.yieldLayout : insightMotion.instant
                              }
                              className="object-workspace-card"
                              data-selected={active}
                            >
                              <button
                                type="button"
                                className="object-workspace-select"
                                aria-pressed={active}
                                aria-label={t('objectWorkspace.selectAccount', { name: label })}
                                onClick={() => {
                                  selectRow(id)
                                  inspect()
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className="object-workspace-identity shrink-0"
                                    aria-hidden="true"
                                  >
                                    {label.slice(0, 1)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold">{label}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {value(row, 'username')}
                                    </p>
                                  </div>
                                  <DictTag type="sys_user_status" value={String(row.status)} />
                                </div>
                                <div className="object-workspace-path mt-4">
                                  <CircleUserRound
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <motion.span
                                    className="object-workspace-path-line"
                                    animate={{ opacity: active ? 1 : stateMotion.dimOpacity }}
                                    transition={
                                      motionEnabled
                                        ? motionTransition.standard
                                        : insightMotion.instant
                                    }
                                  />
                                  <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                                  <span className="min-w-0 truncate">
                                    {value(row, 'deptName') || t('objectWorkspace.unspecified')}
                                  </span>
                                </div>
                              </button>
                            </motion.article>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </ObjectWorkspacePanels>
            </LayoutGroup>
          )
        }}
      </DynaCollection>
      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('objectWorkspace.unassignedTitle')}</DialogTitle>
            <DialogDescription>{t('objectWorkspace.withoutRolesHint')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {overview.isError ? (
              <p role="alert">
                {overview.error instanceof ApiError
                  ? overview.error.message
                  : t('listInsights.failed')}
              </p>
            ) : (
              overview.data?.usersWithoutRoles.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="w-full justify-between"
                  aria-label={t('objectWorkspace.locateAccount', {
                    name: user.nickname || user.username,
                  })}
                  onClick={() => {
                    controls.applyFilters({ keyword: user.username })
                    selectRow(user.id)
                    setRosterOpen(false)
                  }}
                >
                  <span>{user.nickname || user.username}</span>
                  <span className="text-xs text-muted-foreground">{user.username}</span>
                  <ChevronRight className="size-4" />
                </Button>
              ))
            )}
            {overview.data?.usersWithoutRolesCount === 0 && (
              <p className="text-sm text-muted-foreground">{t('objectWorkspace.noUnassigned')}</p>
            )}
          </div>
          {overview.data && (
            <p className="text-xs text-muted-foreground">
              {t('objectWorkspace.rosterAt', { time: overview.data.evaluatedAt })}
              {overview.data.usersWithoutRoles.length < overview.data.usersWithoutRolesCount && (
                <span className="block mt-1">
                  {t('objectWorkspace.unassignedLimit', {
                    shown: overview.data.usersWithoutRoles.length,
                    total: overview.data.usersWithoutRolesCount,
                  })}
                </span>
              )}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
