/**
 * 在线用户：按账号聚合可展开设备会话组 + 区分「单台设备会话强退 (DELETE /system/online-users/{jti})」
 * 与「账号全设备强退 (DELETE /system/online-users/user/{username})」+ PulseIndicator 状态指示。
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, LayoutDashboard, List, LogOut, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { DynaTable, type DynaColumn } from '@/components/dyna'
import { DynaQueryFeedback } from '@/components/dyna/DynaQueryFeedback'
import { PageHeader } from '@/components/layout/PageHeader'
import { CoupledMotionGroup, PulseIndicator } from '@/components/motion'
import { EntityPill, LivingContextBar, useEntityIntent } from '@/components/navigation'
import { ResponsiveInspector } from '@/components/spatial'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { ApiError } from '@/lib/api/client'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useRealtimePulse } from '@/lib/realtime/use-realtime-pulse'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useAuthStore } from '@/stores/auth'

import { OnlineAccounts } from './OnlineAccounts'
import {
  kickOnlineAccount,
  kickOnlineSession,
  listOnlineUsers,
  type KickTarget,
  type OnlineUserRow,
} from './online.api'

const QUERY_KEY = ['system', 'online-users'] as const
const ONLINE_PULSE_KEYS = [QUERY_KEY] as const

const ONLINE_VIEWS = ['overview', 'list'] as const
const noPageChange = () => {}

export default function OnlineUserPage() {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <OnlineUserWorkspace key={authorizationEpoch} />
}

function OnlineUserWorkspace() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const queryClient = useQueryClient()
  const { intent } = useEntityIntent('session')
  const [kicking, setKicking] = useState<KickTarget | null>(null)
  const [detail, setDetail] = useState<OnlineUserRow | null>(null)
  const [expanded, setExpanded] = useState<string | null>(() =>
    intent?.id && intent.id !== 'list' ? intent.id : null,
  )
  const currentUsername = useAuthStore((state) => state.user?.username)
  const desktop = useDesktopViewport()
  const [requestedView, setView] = usePageView(ONLINE_VIEWS)
  const view = desktop ? requestedView : 'list'
  useRealtimePulse({ queryKeys: ONLINE_PULSE_KEYS })

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listOnlineUsers,
  })
  const onDenied = useResourceDenial({
    errors: [error],
    clear: { queryKey: QUERY_KEY },
    reset: () => {
      setKicking(null)
      setDetail(null)
      setExpanded(null)
    },
  })

  const kickLocalKey =
    kicking?.mode === 'account'
      ? `account:${kicking.username}`
      : kicking?.mode === 'session'
        ? `session:${kicking.session.jti}`
        : ''

  const kickMutation = useModuleMutation(undefined, {
    onDenied,
    localKey: kickLocalKey,
    mutationFn: (run, target: KickTarget) =>
      run({
        scope: undefined,
        requiredPerms: ['system:online:kick'],
        execute: (transport) =>
          target.mode === 'account'
            ? kickOnlineAccount(target.username, transport)
            : kickOnlineSession(target.session.jti, transport),
      }),
    onSuccess: (_res, target) => {
      if (target.mode === 'account') {
        toast.success(
          t('common.已将该用户全部设备强制下线', { defaultValue: '已将该用户全部设备强制下线' }),
        )
      } else {
        toast.success('已将该设备会话强制下线')
      }
      setKicking(null)
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : t('common.操作失败', { defaultValue: '操作失败' }),
      ),
  })

  const sessionsOf = useCallback(
    (username: string) => data?.filter((row) => row.username === username).length ?? 0,
    [data],
  )

  const columns = useMemo<DynaColumn[]>(
    () => [
      { key: 'username', title: '用户名' },
      { key: 'ip', title: 'IP 地址' },
      { key: 'deviceSummary', title: '设备' },
      { key: 'loginTime', title: '登录时间', type: 'datetime', sticky: 'right' },
    ],
    [],
  )

  const rows = useMemo(
    () =>
      data?.map((row) => ({
        ...row,
        deviceSummary: summarizeUserAgent(row.userAgent),
      })),
    [data],
  )
  const inspected = data?.find((row) => row.jti === detail?.jti)

  const kickTargetExists = useMemo(() => {
    if (!kicking || !data) return false
    if (kicking.mode === 'account') {
      return data.some((row) => row.username === kicking.username)
    }
    return data.some((row) => row.jti === kicking.session.jti)
  }, [data, kicking])

  const kickingUsername = kicking?.mode === 'account' ? kicking.username : kicking?.session.username

  const retry = useCallback(() => void refetch(), [refetch])

  const renderActions = useCallback(
    (row: Record<string, unknown>) => {
      const record = row as OnlineUserRow
      return (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('common.详情', { defaultValue: '详情' })}
            onClick={() => setDetail(record)}
          >
            <Eye className="size-3.5" />
          </Button>
          <Perm perm="system:online:kick">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('common.强退', { defaultValue: '强退' })}
              onClick={() =>
                setKicking({
                  mode: 'session',
                  session: record,
                  accountSessionCount: sessionsOf(record.username),
                })
              }
            >
              <LogOut className="size-3.5 text-destructive" />
            </Button>
          </Perm>
        </div>
      )
    },
    [sessionsOf, t],
  )

  const activeRowKey =
    detail?.jti ??
    (kicking?.mode === 'session'
      ? kicking.session.jti
      : kicking?.mode === 'account'
        ? kicking.sampleSession.jti
        : null)

  return (
    <CoupledMotionGroup activeId={activeRowKey}>
      <div className="w-full min-w-0 space-y-5 p-4 sm:p-6">
        <PageHeader
          title={t('common.在线用户', { defaultValue: '在线用户' })}
          view={
            desktop ? (
              <SegmentedControl
                label={t('dyna.pageView')}
                value={view}
                onChange={setView}
                options={[
                  {
                    value: 'overview',
                    label: systemT('listInsights.online.workspace'),
                    icon: LayoutDashboard,
                  },
                  { value: 'list', label: t('dyna.viewList'), icon: List },
                ]}
              />
            ) : undefined
          }
          actions={
            <Button
              variant="outline"
              size="icon"
              aria-label={t('dyna.queryRefresh')}
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className="size-4" />
            </Button>
          }
        />

        {view === 'overview' ? (
          <>
            <DynaQueryFeedback
              error={error}
              hasData={data !== undefined}
              refreshing={isFetching}
              onRetry={retry}
            />
            {isLoading && <Skeleton className="h-40" />}
            {data && (
              <OnlineAccounts
                rows={data}
                expanded={expanded}
                onExpanded={setExpanded}
                onDetail={setDetail}
                onKick={setKicking}
                currentUsername={currentUsername}
                intentSource={intent?.source}
              />
            )}
          </>
        ) : (
          <div className="space-y-3">
            {intent?.source && <LivingContextBar source={intent.source} />}
            <DynaTable
              columns={columns}
              rows={rows}
              loading={isLoading}
              error={error}
              refreshing={isFetching}
              onRetry={retry}
              emptyText="queryNoOnlineUsers"
              rowKey="jti"
              actions={renderActions}
              page={1}
              size={Math.max(rows?.length ?? 0, 1)}
              total={rows?.length ?? 0}
              onPageChange={noPageChange}
              paginated={false}
              activeRowKey={activeRowKey}
            />
          </div>
        )}

        <ResponsiveInspector
          mode="sheet"
          open={detail !== null}
          onOpenChange={(open) => !open && setDetail(null)}
          title={t('common.sessionDetails')}
          context={
            detail ? `${detail.username} · ${detail.ip ?? t('common.unknownIp')}` : undefined
          }
        >
          {detail && !inspected && (
            <p role="status" className="text-sm text-muted-foreground">
              {systemT('listInsights.online.sessionGone')}
            </p>
          )}
          {inspected && (
            <div className="space-y-4">
              <LivingContextBar source={intent?.source} title="关联脉络">
                <EntityPill
                  kind="user"
                  id={inspected.username}
                  label={`账号档案：${inspected.username}`}
                />
                <EntityPill kind="log-login" id={inspected.username} label="登录日志" />
              </LivingContextBar>

              <dl className="grid grid-cols-2 gap-3 rounded-control border border-border-subtle bg-muted/20 p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">登录账号</dt>
                  <dd className="mt-1 font-medium">{inspected.username}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('dyna.登录时间', { defaultValue: '登录时间' })}
                  </dt>
                  <dd className="mt-1 font-mono text-xs tabular-nums">
                    {inspected.loginTime.replace('T', ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('common.deviceSummary')}</dt>
                  <dd className="mt-1">{summarizeUserAgent(inspected.userAgent)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {systemT('listInsights.online.accountSessions')}
                  </dt>
                  <dd className="mt-1 tabular-nums">{sessionsOf(inspected.username)}</dd>
                </div>
              </dl>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{t('common.rawUserAgent')}</div>
                <pre className="max-h-40 overflow-auto rounded-control bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
                  {inspected.userAgent ?? '-'}
                </pre>
              </div>
              <Perm perm="system:online:kick">
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setKicking({
                        mode: 'session',
                        session: inspected,
                        accountSessionCount: sessionsOf(inspected.username),
                      })
                      setDetail(null)
                    }}
                  >
                    <LogOut aria-hidden="true" />
                    仅强退此设备
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setKicking({
                        mode: 'account',
                        username: inspected.username,
                        sessionCount: sessionsOf(inspected.username),
                        sampleSession: inspected,
                      })
                      setDetail(null)
                    }}
                  >
                    <LogOut aria-hidden="true" />
                    强退该账号全部设备 ({sessionsOf(inspected.username)})
                  </Button>
                </div>
              </Perm>
            </div>
          )}
        </ResponsiveInspector>

        <AlertDialog
          open={kicking !== null}
          onOpenChange={(open) => !open && !kickMutation.isPending && setKicking(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {kicking?.mode === 'account'
                  ? '确认强退账号全部设备'
                  : t('common.确认强退', { defaultValue: '确认强退单台设备会话' })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {kicking?.mode === 'account'
                  ? `将递增账号「${kicking.username}」的凭证版本，强制其全部 ${kicking.sessionCount} 台在线设备立即下线，所有现有登录和刷新令牌即刻失效。`
                  : kicking?.mode === 'session'
                    ? `仅吊销账号「${kicking.session.username}」在当前设备（${summarizeUserAgent(kicking.session.userAgent)} · ${kicking.session.ip ?? '未知 IP'}）上的单个会话，不影响该账号其余 ${Math.max(0, kicking.accountSessionCount - 1)} 台在线设备。`
                    : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {kickingUsername === currentUsername && (
              <p role="alert" className="text-sm text-destructive">
                {systemT('listInsights.online.selfWarning')}
              </p>
            )}
            {kicking && !kickTargetExists && (
              <p role="status" className="text-sm text-muted-foreground">
                {systemT('listInsights.online.sessionGone')}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={kickMutation.isPending}>
                {t('common.取消', { defaultValue: '取消' })}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={kickMutation.isPending || !kickTargetExists}
                onClick={(event) => {
                  event.preventDefault()
                  if (kicking && kickTargetExists) kickMutation.mutate(kicking)
                }}
              >
                {kickMutation.isPending && <PulseIndicator variant="inline" tone="current" />}
                {kickMutation.isPending
                  ? t('common.强退中…', { defaultValue: '强退中…' })
                  : t('common.确认强退', { defaultValue: '确认强退' })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CoupledMotionGroup>
  )
}
