/**
 * 在线用户（逃逸舱手写）：GET /system/online-users（List 非分页）+ 强退 DELETE /system/online-users/{jti}。
 * DynaTable rowKey=jti，分页禁用（page 固定 1、size 取列表长度）；空态文案「暂无在线用户」。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, LogOut } from 'lucide-react'
import { useMemo, useState } from 'react'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PixelScale } from '@/effects/PixelWave'
import { ApiError } from '@/lib/api/client'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useResourceDenial } from '@/lib/query/use-resource-denial'

import { kickOnlineUser, listOnlineUsers, type OnlineUserRow } from './online.api'

const QUERY_KEY = ['system', 'online-users'] as const

const columns: DynaColumn[] = [
  { key: 'username', title: '用户名' },
  { key: 'ip', title: 'IP 地址' },
  { key: 'deviceSummary', title: '设备' },
  { key: 'loginTime', title: '登录时间', type: 'datetime', sticky: 'right' },
]

export default function OnlineUserPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [kicking, setKicking] = useState<OnlineUserRow | null>(null)
  const [detail, setDetail] = useState<OnlineUserRow | null>(null)

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

  const kickMutation = useMutation({
    mutationFn: (jti: string) => kickOnlineUser(jti),
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

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('common.在线用户', { defaultValue: '在线用户' })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('common.当前在线的登录会话，强退将使该用户全部设备下线', {
            defaultValue: '当前在线的登录会话，强退将使该用户全部设备下线',
          })}
        </p>
      </div>

      <DynaTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        refreshing={isFetching}
        onRetry={() => void refetch()}
        emptyText="queryNoOnlineUsers"
        rowKey="jti"
        actions={(row) => {
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
        }}
        page={1}
        size={Math.max(rows?.length ?? 0, 1)}
        total={rows?.length ?? 0}
        onPageChange={() => {}}
        paginated={false}
      />

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.sessionDetails')}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.username} · ${detail.ip ?? t('common.unknownIp')}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">
                  {t('dyna.登录时间', { defaultValue: '登录时间' })}
                </dt>
                <dd className="mt-1 font-medium">{detail.loginTime.replace('T', ' ')}</dd>
              </div>
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">{t('common.deviceSummary')}</dt>
                <dd className="mt-1 font-medium">{summarizeUserAgent(detail.userAgent)}</dd>
              </div>
              <div className="rounded-md border border-border p-3 sm:col-span-2">
                <dt className="text-muted-foreground">{t('common.rawUserAgent')}</dt>
                <dd className="mt-1 break-all font-mono text-xs">{detail.userAgent ?? '-'}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

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
