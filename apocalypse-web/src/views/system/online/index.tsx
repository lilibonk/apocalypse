/**
 * 在线用户（逃逸舱手写）：GET /system/online-users（List 非分页）+ 强退 DELETE /system/online-users/{jti}。
 * DynaTable rowKey=jti，分页禁用（page 固定 1、size 取列表长度）；空态文案「暂无在线用户」。
 * 会话概况由同一列表实时计算（不额外请求）；会话详情为从来源行展开的 Sheet，可在其中强退该账号。
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, LayoutDashboard, List, LogOut, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { DynaTable, type DynaColumn } from '@/components/dyna'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { InsightStrip } from '@/components/insights/InsightStrip'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { PixelScale } from '@/effects/PixelWave'
import { ApiError } from '@/lib/api/client'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { useAuthStore } from '@/stores/auth'

import { kickOnlineUser, listOnlineUsers, type OnlineUserRow } from './online.api'

const QUERY_KEY = ['system', 'online-users'] as const

const columns: DynaColumn[] = [
  { key: 'username', title: '用户名' },
  { key: 'ip', title: 'IP 地址' },
  { key: 'deviceSummary', title: '设备' },
  { key: 'loginTime', title: '登录时间', type: 'datetime', sticky: 'right' },
]

const ONLINE_VIEWS = ['list', 'overview'] as const
const noPageChange = () => {}

export default function OnlineUserPage() {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <OnlineUserWorkspace key={authorizationEpoch} />
}

function OnlineUserWorkspace() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const queryClient = useQueryClient()
  const [kicking, setKicking] = useState<OnlineUserRow | null>(null)
  const [detail, setDetail] = useState<OnlineUserRow | null>(null)
  const desktop = useDesktopViewport()
  const [requestedView, setView] = usePageView(ONLINE_VIEWS)
  const view = desktop ? requestedView : 'list'

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listOnlineUsers,
  })
  useResourceDenial({
    errors: [error],
    clear: { queryKey: QUERY_KEY },
    reset: () => {
      setKicking(null)
      setDetail(null)
    },
  })

  const kickMutation = useModuleMutation(undefined, {
    localKey: kicking?.jti ?? '',
    mutationFn: (run, jti: string) =>
      run({
        scope: undefined,
        requiredPerms: ['system:online:kick'],
        execute: (transport) => kickOnlineUser(jti, transport),
      }),
    onSuccess: () => {
      toast.success(
        t('common.已将该用户全部设备强制下线', { defaultValue: '已将该用户全部设备强制下线' }),
      )
      setKicking(null)
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.操作失败', { defaultValue: '操作失败' }),
      ),
  })

  const rows = useMemo(
    () =>
      data?.map((row) => ({
        ...row,
        deviceSummary: summarizeUserAgent(row.userAgent),
      })),
    [data],
  )
  // Counted from the list already on screen: no extra request, always consistent with the table.
  const summary = useMemo(() => {
    if (!data) return null
    const perAccount = new Map<string, number>()
    for (const row of data) perAccount.set(row.username, (perAccount.get(row.username) ?? 0) + 1)
    return {
      sessions: data.length,
      accounts: perAccount.size,
      ips: new Set(data.map((row) => row.ip).filter(Boolean)).size,
      multiSession: [...perAccount.values()].filter((count) => count > 1).length,
    }
  }, [data])
  const retry = useCallback(() => void refetch(), [refetch])
  // Stable so opening the detail Sheet re-renders only the highlighted row.
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
              onClick={() => setKicking(record)}
            >
              <LogOut className="size-3.5 text-destructive" />
            </Button>
          </Perm>
        </div>
      )
    },
    [t],
  )
  const sessionsOf = (username: string) =>
    data?.filter((row) => row.username === username).length ?? 0

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('common.在线用户', { defaultValue: '在线用户' })}
        description={t('common.当前在线的登录会话，强退将使该用户全部设备下线', {
          defaultValue: '当前在线的登录会话，强退将使该用户全部设备下线',
        })}
        view={
          desktop ? (
            <SegmentedControl
              label={t('dyna.pageView')}
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: t('dyna.viewList'), icon: List },
                { value: 'overview', label: t('dyna.viewOverview'), icon: LayoutDashboard },
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
        summary && (
          <InsightStrip
            id="online-insights"
            title={systemT('listInsights.online.title')}
            hint={systemT('listInsights.online.hint')}
            entranceKey="system:online:insights"
            stats={[
              {
                key: 'sessions',
                label: systemT('listInsights.online.sessions'),
                value: summary.sessions,
              },
              {
                key: 'accounts',
                label: systemT('listInsights.online.accounts'),
                value: summary.accounts,
              },
              { key: 'ips', label: systemT('listInsights.online.ips'), value: summary.ips },
              {
                key: 'multiSession',
                label: systemT('listInsights.online.multiSession'),
                hint: systemT('listInsights.online.multiSessionHint'),
                value: summary.multiSession,
              },
            ]}
          />
        )
      ) : (
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
          activeRowKey={detail?.jti ?? kicking?.jti ?? null}
        />
      )}

      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t('common.sessionDetails')}</SheetTitle>
            <SheetDescription>
              {detail ? `${detail.username} · ${detail.ip ?? t('common.unknownIp')}` : ''}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="min-h-0 space-y-5 overflow-y-auto px-6 pb-6">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('dyna.登录时间', { defaultValue: '登录时间' })}
                  </dt>
                  <dd className="mt-1 tabular-nums">{detail.loginTime.replace('T', ' ')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('common.deviceSummary')}</dt>
                  <dd className="mt-1">{summarizeUserAgent(detail.userAgent)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {systemT('listInsights.online.accountSessions')}
                  </dt>
                  <dd className="mt-1 tabular-nums">{sessionsOf(detail.username)}</dd>
                </div>
              </dl>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">{t('common.rawUserAgent')}</div>
                <pre className="max-h-40 overflow-auto rounded-control bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
                  {detail.userAgent ?? '-'}
                </pre>
              </div>
            </div>
          )}
          {detail && (
            <Perm perm="system:online:kick">
              <SheetFooter>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setKicking(detail)
                    setDetail(null)
                  }}
                >
                  <LogOut aria-hidden="true" />
                  {systemT('listInsights.online.kick')}
                </Button>
              </SheetFooter>
            </Perm>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={kicking !== null}
        onOpenChange={(open) => !open && !kickMutation.isPending && setKicking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('common.确认强退', { defaultValue: '确认强退' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {kicking
                ? t('common.将强制用户 {{name}} 的全部设备下线，所有现有登录和刷新令牌立即失效。', {
                    defaultValue:
                      '将强制用户「{{name}}」的全部设备下线，所有现有登录和刷新令牌立即失效。',
                    name: kicking.username,
                  })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kickMutation.isPending}>
              {t('common.取消', { defaultValue: '取消' })}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={kickMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (kicking) kickMutation.mutate(kicking.jti)
              }}
            >
              {kickMutation.isPending && <PixelScale variant="inline" tone="current" />}
              {kickMutation.isPending
                ? t('common.强退中…', { defaultValue: '强退中…' })
                : t('common.确认强退', { defaultValue: '确认强退' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
