import { ChevronDown, Eye, LogOut, Monitor } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Perm } from '@/components/Perm'
import { FluidConduitOverlay, MetricValue, type ConduitLink } from '@/components/motion'
import { EntityPeekLink, LivingContextBar } from '@/components/navigation'
import type { EntitySourceRef } from '@/components/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { stateMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { summarizeUserAgent } from '@/lib/user-agent'
import { cn } from '@/lib/utils'

import type { KickTarget, OnlineUserRow } from './online.api'
import { groupOnlineAccounts } from './online.model'

export function OnlineAccounts({
  rows,
  expanded,
  onExpanded,
  onDetail,
  onKick,
  currentUsername,
  intentSource,
}: {
  rows: OnlineUserRow[]
  expanded: string | null
  onExpanded: (username: string | null) => void
  onDetail: (row: OnlineUserRow) => void
  onKick: (target: KickTarget) => void
  currentUsername?: string
  intentSource?: EntitySourceRef | null
}) {
  const { t, i18n } = useTranslation('system')
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'
  const animate = useMotionPreference()
  const accounts = useMemo(() => groupOnlineAccounts(rows), [rows])
  const counts = [
    ['accounts', accounts.length],
    ['sessions', rows.length],
    ['ips', new Set(rows.map((row) => row.ip).filter(Boolean)).size],
    ['multiSession', accounts.filter((account) => account.sessions.length > 1).length],
  ] as const

  return (
    <section
      aria-label={t('listInsights.online.workspace')}
      data-theme-stage=""
      className="space-y-4"
    >
      {intentSource && <LivingContextBar source={intentSource} />}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border-subtle bg-card px-4 py-3.5 shadow-surface">
        <dl className="flex flex-wrap gap-6 sm:gap-8">
          {counts.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{t(`listInsights.online.${key}`)}</dt>
              <dd className="insight-metric mt-1 text-xl font-semibold tabular-nums">
                <MetricValue
                  value={value}
                  variant={key === 'sessions' ? 'hero-odometer' : 'tabular'}
                  language={language}
                  motionEnabled={animate}
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {expanded && !accounts.some((account) => account.username === expanded) && (
        <p role="status" className="rounded-control bg-muted p-3 text-sm">
          {t('listInsights.online.accountGone', { name: expanded })}
        </p>
      )}
      {accounts.length === 0 && (
        <p
          role="status"
          className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        >
          {rows.length === 0 ? t('listInsights.online.empty') : t('listInsights.online.noMatches')}
        </p>
      )}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {accounts.map((account) => {
            const open = expanded === account.username
            return (
              <OnlineAccountCard
                key={account.username}
                account={account}
                open={open}
                animate={animate}
                currentUsername={currentUsername}
                onToggle={() => onExpanded(open ? null : account.username)}
                onDetail={onDetail}
                onKick={onKick}
              />
            )
          })}
        </AnimatePresence>
      </div>
    </section>
  )
}

function OnlineAccountCard({
  account,
  open,
  animate,
  currentUsername,
  onToggle,
  onDetail,
  onKick,
}: {
  account: ReturnType<typeof groupOnlineAccounts>[number]
  open: boolean
  animate: boolean
  currentUsername?: string
  onToggle: () => void
  onDetail: (row: OnlineUserRow) => void
  onKick: (target: KickTarget) => void
}) {
  const { t } = useTranslation('system')
  const conduitStageRef = useRef<HTMLDivElement>(null)
  const links = useMemo<ConduitLink[]>(
    () =>
      open
        ? account.sessions.map((session) => ({
            id: `online-conduit-${session.jti}`,
            from: `online-avatar-${account.username}`,
            to: `online-session-${session.jti}`,
            enabled: true,
            scope: account.sessions.length > 1 ? 'ALL' : 'STANDARD',
          }))
        : [],
    [account.sessions, account.username, open],
  )

  return (
    <motion.section
      layout={animate ? 'position' : false}
      initial={animate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={animate ? { opacity: 0, scale: 0.98 } : undefined}
      transition={stateMotion.yieldLayout}
      data-account={account.username}
      className={cn(
        'sketch-surface relative overflow-hidden rounded-panel border border-border bg-card',
        open && 'border-primary/45',
      )}
    >
      <div className={cn('flex flex-wrap items-center gap-3 p-4', open && 'bg-primary/5')}>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-brand-text/30 bg-primary/15 text-sm font-semibold text-brand-text shadow-xs"
          >
            {account.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{account.username}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('listInsights.online.deviceCount', {
                count: account.sessions.length,
              })}
            </span>
          </span>
          {account.username === currentUsername && (
            <Badge variant="outline">{t('listInsights.online.currentAccount')}</Badge>
          )}
          <ChevronDown
            className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <EntityPeekLink
            kind="user"
            id={account.username}
            label={t('listInsights.online.accountProfile', {
              defaultValue: '账号档案',
            })}
            className="text-xs"
          />
          <EntityPeekLink
            kind="log-login"
            id={account.username}
            label={t('listInsights.online.loginLogs', { defaultValue: '登录日志' })}
            className="text-xs"
          />
        </div>
        <Perm perm="system:online:kick">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onKick({
                mode: 'account',
                username: account.username,
                sessionCount: account.sessions.length,
                sampleSession: account.sessions[0],
              })
            }
          >
            <LogOut className="text-destructive" />
            强退全部设备 ({account.sessions.length})
          </Button>
        </Perm>
      </div>
      {open && (
        <div ref={conduitStageRef} className="relative border-t border-border-subtle p-4">
          <FluidConduitOverlay
            containerRef={conduitStageRef}
            links={links}
            flow="horizontal"
            minContainerWidth={560}
            pulseKey={account.sessions.length}
          />
          <div className="relative z-[2] grid items-center gap-6 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] md:gap-11">
            <div className="hidden justify-center md:flex">
              <div
                data-conduit-anchor={`online-avatar-${account.username}`}
                className="flex flex-col items-center gap-2 rounded-panel border border-border-subtle bg-card/90 p-4 text-center shadow-xs"
              >
                <span className="flex size-14 items-center justify-center rounded-full border-2 border-brand-text/45 bg-primary/15 text-lg font-semibold text-brand-text shadow-sm">
                  {account.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-xs font-medium text-foreground">{account.username}</span>
                <span className="rounded-full bg-primary/12 px-2 py-0.5 font-mono text-[11px] text-brand-text tabular-nums">
                  {account.sessions.length} LIVE
                </span>
              </div>
            </div>
            <ul className="space-y-2.5">
              <AnimatePresence initial={false}>
                {account.sessions.map((session) => (
                  <motion.li
                    key={session.jti}
                    data-conduit-anchor={`online-session-${session.jti}`}
                    layout={animate ? 'position' : false}
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    exit={animate ? { opacity: 0, height: 0 } : undefined}
                    transition={stateMotion.yieldLayout}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border-subtle bg-card/90 px-4 py-3 shadow-xs"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Monitor className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {summarizeUserAgent(session.userAgent)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {session.ip ?? '—'} · {session.loginTime.replace('T', ' ')} ·{' '}
                          <code className="font-mono text-[11px]">
                            jti:{session.jti.slice(0, 8)}
                          </code>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => onDetail(session)}>
                        <Eye />
                        {t('listInsights.online.details')}
                      </Button>
                      <Perm perm="system:online:kick">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            onKick({
                              mode: 'session',
                              session,
                              accountSessionCount: account.sessions.length,
                            })
                          }
                        >
                          <LogOut className="size-3.5" />
                          强退此设备
                        </Button>
                      </Perm>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </div>
      )}
    </motion.section>
  )
}
