import { ChevronDown, Eye, LogOut, Monitor } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Perm } from '@/components/Perm'
import { MetricValue } from '@/components/motion'
import { EntityPill, LivingContextBar } from '@/components/navigation'
import type { EntitySourceRef } from '@/components/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const [search, setSearch] = useState('')
  const accounts = useMemo(() => groupOnlineAccounts(rows), [rows])
  const keyword = search.trim().toLowerCase()
  const visible = accounts.filter(
    (account) =>
      !keyword ||
      account.username.toLowerCase().includes(keyword) ||
      account.sessions.some((session) => session.ip?.toLowerCase().includes(keyword)),
  )
  const counts = [
    ['accounts', accounts.length],
    ['sessions', rows.length],
    ['ips', new Set(rows.map((row) => row.ip).filter(Boolean)).size],
    ['multiSession', accounts.filter((account) => account.sessions.length > 1).length],
  ] as const

  const expandedAccount = accounts.find((account) => account.username === expanded)

  return (
    <section aria-label={t('listInsights.online.workspace')} className="space-y-4">
      {(intentSource || expandedAccount) && (
        <LivingContextBar source={intentSource} title="选中账号脉络">
          {expandedAccount && (
            <>
              <EntityPill
                kind="user"
                id={expandedAccount.username}
                label={`账号档案：${expandedAccount.username}`}
              />
              <EntityPill kind="log-login" id={expandedAccount.username} label="登录日志" />
            </>
          )}
        </LivingContextBar>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <dl className="flex flex-wrap gap-6">
          {counts.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{t(`listInsights.online.${key}`)}</dt>
              <dd className="mt-1 text-xl font-medium tabular-nums">
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
        <div className="grid w-full gap-1.5 sm:w-64">
          <Label htmlFor="online-account-search">{t('listInsights.online.search')}</Label>
          <Input
            id="online-account-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {expanded && !accounts.some((account) => account.username === expanded) && (
        <p role="status" className="rounded-control bg-muted p-3 text-sm">
          {t('listInsights.online.accountGone', { name: expanded })}
        </p>
      )}
      {visible.length === 0 && (
        <p
          role="status"
          className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        >
          {t(rows.length === 0 ? 'listInsights.online.empty' : 'listInsights.online.noMatches')}
        </p>
      )}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {visible.map((account) => {
            const open = expanded === account.username
            return (
              <motion.section
                key={account.username}
                layout={animate ? 'position' : false}
                initial={animate ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={animate ? { opacity: 0, scale: 0.98 } : undefined}
                transition={stateMotion.yieldLayout}
                data-account={account.username}
                className={cn(
                  'relative overflow-hidden rounded-panel border border-border bg-card',
                  open && 'border-primary/40',
                )}
              >
                <div
                  className={cn('flex flex-wrap items-center gap-3 p-4', open && 'bg-primary/5')}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onExpanded(open ? null : account.username)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Monitor className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {account.username}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
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
                  <ul className="divide-y divide-border border-t border-border">
                    <AnimatePresence initial={false}>
                      {account.sessions.map((session) => (
                        <motion.li
                          key={session.jti}
                          layout={animate ? 'position' : false}
                          initial={animate ? { opacity: 0 } : false}
                          animate={{ opacity: 1 }}
                          exit={animate ? { opacity: 0, height: 0 } : undefined}
                          transition={stateMotion.yieldLayout}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
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
                )}
              </motion.section>
            )
          })}
        </AnimatePresence>
      </div>
    </section>
  )
}
