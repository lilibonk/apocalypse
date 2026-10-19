/**
 * Command palette "?" questions for authorization. Deterministic rule queries over the server's
 * authorization configuration — not AI and not an inference of any user's final effective access.
 * Registered through command-questions.tsx; data stays in this module.
 */
import type { UseQueryResult } from '@tanstack/react-query'
import { CircleHelp, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CommandGroup, CommandItem } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import type { CommandQuestionPanelProps } from '@/components/layout/command-extensions'
import { ApiError, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import type { FlatRoute } from '@/routes/menu-routes'
import { useAuthStore } from '@/stores/auth'

import {
  getAuthorizationOverview,
  getPermissionHolders,
  type AuthorizationOverview,
  type PermissionHolders,
} from './authorization-insight.api'
import { canAskAuthorizationQuestions } from './authorization-questions.model'
import { PrivateData } from './PrivateData'
import './command-questions.css'

type Template = 'holders' | 'idle' | 'usersWithoutRoles' | 'unassignedNavigation'
const templates: readonly Template[] = [
  'holders',
  'idle',
  'usersWithoutRoles',
  'unassignedNavigation',
]

interface PermissionOption {
  id: string
  code: string
  name: string
}

function routeFor(routes: readonly FlatRoute[], component: string) {
  return routes.find(
    (route) => route.component?.replace(/^\/+|\/+$/g, '').replace(/\/index$/, '') === component,
  )?.path
}

function usePrivateKey(parts: readonly unknown[]) {
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return JSON.stringify([...parts, epoch, authorizationEpoch])
}

function useDelayed(active: boolean, delay = 300) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setLate(true), delay)
    return () => {
      window.clearTimeout(timer)
      setLate(false)
    }
  }, [active, delay])
  return active && late
}

function AnswerFrame({
  question,
  evaluatedAt,
  children,
}: {
  question: string
  evaluatedAt?: string
  children: ReactNode
}) {
  const { t, i18n } = useTranslation('system')
  const time = evaluatedAt
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-US' : 'zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(evaluatedAt))
    : null
  return (
    <section
      aria-label={t('commandQa.answer')}
      className="command-answer mx-2 my-2 rounded-control p-3 text-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 font-medium text-foreground">
          <Sparkles className="size-3" aria-hidden="true" />
          {t('commandQa.ruleBased')}
        </span>
        {time && <span>{t('commandQa.evaluatedAt', { time })}</span>}
      </div>
      <p className="mb-2 font-medium">{question}</p>
      {children}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {t('commandQa.disclaimer')}
      </p>
    </section>
  )
}

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation('system')
  return (
    <div role="alert" className="mx-2 my-2 space-y-2 rounded-control bg-muted p-3 text-sm">
      <p>{error instanceof ApiError ? error.message : t('commandQa.failed')}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t('commandQa.retry')}
      </Button>
    </div>
  )
}

function Loading({ active }: { active: boolean }) {
  const { t } = useTranslation('system')
  const late = useDelayed(active)
  if (!active) return null
  return (
    <p role="status" className="px-4 py-4 text-sm text-muted-foreground">
      {late ? t('commandQa.querying') : ''}
    </p>
  )
}

function HoldersAnswer({
  permission,
  question,
  routes,
  navigate,
}: {
  permission: PermissionOption
  question: string
  routes: readonly FlatRoute[]
  navigate: (path: string) => void
}) {
  const queryKey = ['system', 'authorization', 'insights', 'holders', permission.id] as const
  return (
    <PrivateData<PermissionHolders>
      key={usePrivateKey(queryKey)}
      queryKey={queryKey}
      canRead={canAskAuthorizationQuestions}
      load={({ signal }) => getPermissionHolders(permission.id, signal)}
    >
      {(query) => (
        <HoldersResult query={query} question={question} routes={routes} navigate={navigate} />
      )}
    </PrivateData>
  )
}

function HoldersResult({
  query,
  question,
  routes,
  navigate,
}: {
  query: UseQueryResult<PermissionHolders>
  question: string
  routes: readonly FlatRoute[]
  navigate: (path: string) => void
}) {
  const { t } = useTranslation('system')
  const rolePath = routeFor(routes, 'system/role')
  if (query.isPending) return <Loading active />
  if (query.isError) return <Failure error={query.error} onRetry={() => void query.refetch()} />
  const data = query.data
  return (
    <AnswerFrame question={question} evaluatedAt={data.evaluatedAt}>
      <p className="mb-2 text-muted-foreground">
        <code className="font-mono text-xs text-foreground">{data.code}</code> · {data.name}
        {!data.moduleEnabled && ` · ${t('commandQa.moduleDisabled')}`}
      </p>
      {data.roles.length === 0 ? (
        <p role="status">{t('commandQa.noHolders')}</p>
      ) : (
        <>
          <p className="mb-2">
            {t('commandQa.holdersSummary', {
              active: data.activeRoleCount,
              total: data.roles.length,
              users: data.coveredVisibleUserCount,
            })}
          </p>
          <ul className="space-y-2">
            {data.roles.map((role) => (
              <li key={role.roleId} className="rounded-control bg-card p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {rolePath ? (
                    <button
                      type="button"
                      className="font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() =>
                        navigate(
                          `${rolePath}?roleId=${encodeURIComponent(role.roleId)}&roleKey=${encodeURIComponent(role.roleKey)}`,
                        )
                      }
                    >
                      {role.roleName}
                    </button>
                  ) : (
                    <span className="font-medium">{role.roleName}</span>
                  )}
                  <span
                    className="command-grant-state rounded-full px-2 py-0.5 text-xs"
                    data-state={role.state}
                  >
                    {t(`commandQa.state.${role.state}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`authorization.${role.effectiveScope}`, {
                      defaultValue: role.effectiveScope,
                    })}
                  </span>
                </div>
                {(role.validFrom || role.validUntil) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('commandQa.window', {
                      from: role.validFrom ? new Date(role.validFrom).toLocaleString() : '—',
                      until: role.validUntil ? new Date(role.validUntil).toLocaleString() : '—',
                    })}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {role.members.map((member) => (
                    <span key={member.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {member.nickname || member.username}
                    </span>
                  ))}
                  {role.visibleMemberCount > role.members.length && (
                    <span className="text-xs text-muted-foreground">
                      {t('commandQa.moreMembers', {
                        count: role.visibleMemberCount - role.members.length,
                      })}
                    </span>
                  )}
                  {data.outOfScopeVisible && role.outOfScopeMemberCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t('commandQa.outOfScope', { count: role.outOfScopeMemberCount })}
                    </span>
                  )}
                  {!data.membersVisible && (
                    <span className="text-xs text-muted-foreground">
                      {t('commandQa.membersHidden')}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </AnswerFrame>
  )
}

function OverviewAnswer({
  template,
  question,
  routes,
  navigate,
}: {
  template: Exclude<Template, 'holders'>
  question: string
  routes: readonly FlatRoute[]
  navigate: (path: string) => void
}) {
  const queryKey = ['system', 'authorization', 'insights', 'overview'] as const
  return (
    <PrivateData<AuthorizationOverview>
      key={usePrivateKey(queryKey)}
      queryKey={queryKey}
      canRead={canAskAuthorizationQuestions}
      load={({ signal }) => getAuthorizationOverview(signal)}
    >
      {(query) => (
        <OverviewResult
          query={query}
          template={template}
          question={question}
          routes={routes}
          navigate={navigate}
        />
      )}
    </PrivateData>
  )
}

function OverviewResult({
  query,
  template,
  question,
  routes,
  navigate,
}: {
  query: UseQueryResult<AuthorizationOverview>
  template: Exclude<Template, 'holders'>
  question: string
  routes: readonly FlatRoute[]
  navigate: (path: string) => void
}) {
  const { t } = useTranslation('system')
  if (query.isPending) return <Loading active />
  if (query.isError) return <Failure error={query.error} onRetry={() => void query.refetch()} />
  const data = query.data
  const rolePath = routeFor(routes, 'system/role')
  const menuPath = routeFor(routes, 'system/menu')
  const userPath = routeFor(routes, 'system/user')
  if (template === 'idle')
    return (
      <AnswerFrame question={question} evaluatedAt={data.evaluatedAt}>
        <p className="mb-2">{t('commandQa.idleSummary', { count: data.idleRoleCount })}</p>
        <ul className="space-y-1">
          {data.idleRoles.map((role) => (
            <li key={role.roleId} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!rolePath}
                className="font-medium underline-offset-2 hover:underline disabled:no-underline"
                onClick={() =>
                  rolePath &&
                  navigate(
                    `${rolePath}?roleId=${encodeURIComponent(role.roleId)}&roleKey=${encodeURIComponent(role.roleKey)}`,
                  )
                }
              >
                {role.roleName}
              </button>
              <span className="text-xs text-muted-foreground">
                {t(`commandQa.idleReason.${role.reason}`)}
              </span>
            </li>
          ))}
        </ul>
        {data.idleRoleCount > data.idleRoles.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('commandQa.truncated', { shown: data.idleRoles.length })}
          </p>
        )}
      </AnswerFrame>
    )
  if (template === 'usersWithoutRoles')
    return (
      <AnswerFrame question={question} evaluatedAt={data.evaluatedAt}>
        {!data.usersVisible ? (
          <p role="status">{t('commandQa.usersHidden')}</p>
        ) : (
          <>
            <p className="mb-2">
              {t('commandQa.usersWithoutRolesSummary', { count: data.usersWithoutRolesCount })}
            </p>
            <div className="flex flex-wrap gap-1">
              {data.usersWithoutRoles.map((user) => (
                <span key={user.id} className="rounded-full bg-card px-2 py-0.5 text-xs">
                  {user.nickname || user.username}
                </span>
              ))}
            </div>
            {userPath && data.usersWithoutRolesCount > 0 && (
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => navigate(userPath)}
              >
                {t('commandQa.openUsers')}
              </Button>
            )}
          </>
        )}
      </AnswerFrame>
    )
  return (
    <AnswerFrame question={question} evaluatedAt={data.evaluatedAt}>
      <p className="mb-2">
        {t('commandQa.unassignedSummary', {
          count: data.unassignedNavigationCount,
          total: data.navigationCount,
        })}
      </p>
      <ul className="space-y-1">
        {data.unassignedNavigation.map((menu) => (
          <li key={menu.menuId} className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!menuPath}
              className="font-medium underline-offset-2 hover:underline disabled:no-underline"
              onClick={() =>
                menuPath && navigate(`${menuPath}?menuId=${encodeURIComponent(menu.menuId)}`)
              }
            >
              {menu.menuName}
            </button>
            <span className="text-xs text-muted-foreground">
              {menu.menuType === 'C' ? t('commandQa.directory') : t('commandQa.page')}
              {!menu.moduleEnabled && ` · ${t('commandQa.moduleDisabled')}`}
            </span>
          </li>
        ))}
      </ul>
    </AnswerFrame>
  )
}

function PermissionPicker({
  keyword,
  onPick,
  highlight,
}: {
  keyword: string
  onPick: (permission: PermissionOption) => void
  highlight: (value: string) => void
}) {
  const [debounced, setDebounced] = useState(keyword)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword), 200)
    return () => window.clearTimeout(timer)
  }, [keyword])
  const queryKey = ['system', 'authorization', 'insights', 'permission-options', debounced] as const
  return (
    <PrivateData<PageResult<PermissionOption>>
      key={usePrivateKey(queryKey)}
      queryKey={queryKey}
      canRead={canAskAuthorizationQuestions}
      load={(transport) =>
        request<PageResult<PermissionOption>>('/system/permissions/page', {
          query: { page: 1, size: 20, keyword: debounced || undefined },
          ...transport,
        })
      }
    >
      {(query) => <PermissionOptions query={query} onPick={onPick} highlight={highlight} />}
    </PrivateData>
  )
}

function PermissionOptions({
  query,
  onPick,
  highlight,
}: {
  query: UseQueryResult<PageResult<PermissionOption>>
  onPick: (permission: PermissionOption) => void
  highlight: (value: string) => void
}) {
  const { t } = useTranslation('system')
  const first = query.data?.list[0]?.id
  useEffect(() => {
    // Results arrive after cmdk's own first-item pass; keep Enter useful.
    if (first) highlight(`permission-${first}`)
  }, [first, highlight])
  if (query.isPending) return <Loading active />
  if (query.isError) return <Failure error={query.error} onRetry={() => void query.refetch()} />
  if (query.data.list.length === 0)
    return (
      <p role="status" className="px-4 py-4 text-sm text-muted-foreground">
        {t('commandQa.noPermissionMatch')}
      </p>
    )
  return (
    <CommandGroup heading={t('commandQa.pickPermission')}>
      {query.data.list.map((permission) => (
        <CommandItem
          key={permission.id}
          value={`permission-${permission.id}`}
          onSelect={() => onPick(permission)}
        >
          <KeyRound className="size-4" />
          <span className="min-w-0 flex-1 truncate">{permission.name}</span>
          <code className="truncate font-mono text-xs text-muted-foreground">
            {permission.code}
          </code>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export function AuthorizationQuestions({
  query,
  setQuery,
  routes,
  navigate,
  highlight,
}: CommandQuestionPanelProps) {
  const { t } = useTranslation('system')
  const [picked, setPicked] = useState<PermissionOption | null>(null)
  const labels = Object.fromEntries(
    templates.map((template) => [template, t(`commandQa.q.${template}`)]),
  ) as Record<Template, string>
  const text = query.trimStart()
  const template = templates.find((candidate) => text.startsWith(labels[candidate])) ?? null
  const rest = template ? text.slice(labels[template].length).trim() : text.trim()

  if (!template) {
    const matches = templates.filter(
      (candidate) => !rest || labels[candidate].toLowerCase().includes(rest.toLowerCase()),
    )
    return (
      <CommandGroup heading={t('commandQa.suggestions')}>
        {matches.map((candidate) => (
          <CommandItem
            key={candidate}
            value={`question-${candidate}`}
            onSelect={() => {
              setPicked(null)
              setQuery(candidate === 'holders' ? `${labels[candidate]} ` : labels[candidate])
            }}
          >
            <CircleHelp className="size-4" />
            {labels[candidate]}
          </CommandItem>
        ))}
        {matches.length === 0 && (
          <p role="status" className="px-2 py-4 text-sm text-muted-foreground">
            {t('commandQa.noSuggestion')}
          </p>
        )}
      </CommandGroup>
    )
  }
  if (template === 'holders') {
    const permission = picked && rest === picked.code ? picked : null
    if (!permission)
      return (
        <PermissionPicker
          keyword={rest}
          highlight={highlight}
          onPick={(option) => {
            setPicked(option)
            setQuery(`${labels.holders} ${option.code}`)
          }}
        />
      )
    return (
      <HoldersAnswer
        permission={permission}
        question={`${labels.holders} ${permission.code}`}
        routes={routes}
        navigate={navigate}
      />
    )
  }
  return (
    <OverviewAnswer
      template={template}
      question={labels[template]}
      routes={routes}
      navigate={navigate}
    />
  )
}
