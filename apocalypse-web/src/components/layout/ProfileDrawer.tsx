/**
 * 个人中心抽屉：基本资料（修改昵称）、修改密码（成功后重置全部令牌并跳登录）、当前活跃设备会话管理。
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Monitor, RefreshCw, UserCheck } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import * as authApi from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useAuthStore } from '@/stores/auth'
import { useTabsStore } from '@/stores/tabs'

const SELF_SESSIONS_QUERY_KEY = ['system', 'self-sessions'] as const

export function ProfileDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const ensureMe = useAuthStore((state) => state.ensureMe)
  const clearSession = useAuthStore((state) => state.clearSession)
  const resetTabs = useTabsStore((state) => state.reset)

  const nicknameId = useId()
  const oldPasswordId = useId()
  const newPasswordId = useId()
  const confirmPasswordId = useId()

  const [draftNickname, setDraftNickname] = useState<string | null>(null)
  const nickname = draftNickname ?? user?.nickname ?? ''
  const [savingProfile, setSavingProfile] = useState(false)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [revokingJti, setRevokingJti] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)

  const {
    data: sessions = [],
    isFetching: loadingSessions,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: SELF_SESSIONS_QUERY_KEY,
    queryFn: ({ signal }) => authApi.fetchSelfSessions({ signal }),
    enabled: open,
  })

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = nickname.trim()
    if (!trimmed || savingProfile) return
    setSavingProfile(true)
    try {
      await authApi.updateSelfProfile(trimmed)
      await ensureMe()
      setDraftNickname(null)
      toast.success(t('common.资料已更新', { defaultValue: '个人资料已更新' }))
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.保存失败', { defaultValue: '保存失败' }),
      )
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSavePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!oldPassword || !newPassword || savingPassword) return
    if (newPassword !== confirmPassword) {
      toast.error(t('common.两次输入的新密码不一致', { defaultValue: '两次输入的新密码不一致' }))
      return
    }
    setSavingPassword(true)
    try {
      await authApi.updateSelfPassword(oldPassword, newPassword)
      toast.success(t('common.密码已修改请重新登录', { defaultValue: '密码已修改，请重新登录' }))
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onOpenChange(false)
      clearSession()
      resetTabs()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.操作失败', { defaultValue: '操作失败' }),
      )
    } finally {
      setSavingPassword(false)
    }
  }

  const handleRevokeSession = async (jti: string) => {
    if (revokingJti) return
    setRevokingJti(jti)
    try {
      await authApi.revokeSelfSession(jti)
      toast.success(t('common.设备已下线', { defaultValue: '已将该设备会话下线' }))
      await queryClient.invalidateQueries({ queryKey: SELF_SESSIONS_QUERY_KEY })
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.操作失败', { defaultValue: '操作失败' }),
      )
    } finally {
      setRevokingJti(null)
    }
  }

  const handleRevokeAll = async () => {
    if (revokingAll) return
    setRevokingAll(true)
    try {
      await authApi.revokeAllSelfSessions()
      toast.success(
        t('common.已注销全部设备会话', { defaultValue: '已注销全部设备会话，请重新登录' }),
      )
      onOpenChange(false)
      clearSession()
      resetTabs()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.操作失败', { defaultValue: '操作失败' }),
      )
    } finally {
      setRevokingAll(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('common.个人中心', { defaultValue: '个人中心' })}</SheetTitle>
          <SheetDescription>
            {t('common.账户资料与登录会话管理', {
              defaultValue: '维护个人展示资料、登录密码与当前活跃设备会话。',
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 pb-6">
          <form onSubmit={(event) => void handleSaveProfile(event)} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserCheck className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>{t('common.基本资料', { defaultValue: '基本资料' })}</span>
            </div>
            <dl className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle bg-muted/30 p-3 text-xs">
              <div>
                <dt className="text-muted-foreground">
                  {t('login.username', { defaultValue: '用户名' })}
                </dt>
                <dd className="mt-0.5 font-mono font-medium">{user?.username ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('menu.部门管理', { defaultValue: '部门' })}
                </dt>
                <dd className="mt-0.5 font-medium">{user?.deptName ?? '-'}</dd>
              </div>
            </dl>
            <div className="space-y-1.5">
              <Label htmlFor={nicknameId}>{t('dyna.昵称', { defaultValue: '昵称' })}</Label>
              <div className="flex gap-2">
                <Input
                  id={nicknameId}
                  value={nickname}
                  maxLength={64}
                  onChange={(event) => setDraftNickname(event.target.value)}
                  required
                />
                <Button type="submit" size="sm" disabled={savingProfile || !nickname.trim()}>
                  {savingProfile
                    ? t('common.保存中…', { defaultValue: '保存中…' })
                    : t('common.保存', { defaultValue: '保存' })}
                </Button>
              </div>
            </div>
          </form>

          <Separator />

          <form onSubmit={(event) => void handleSavePassword(event)} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>{t('common.修改密码', { defaultValue: '修改密码' })}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={oldPasswordId}>
                {t('common.原密码', { defaultValue: '原密码' })}
              </Label>
              <Input
                id={oldPasswordId}
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={newPasswordId}>
                {t('common.新密码', { defaultValue: '新密码' })}
              </Label>
              <Input
                id={newPasswordId}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={confirmPasswordId}>
                {t('common.确认新密码', { defaultValue: '确认新密码' })}
              </Label>
              <Input
                id={confirmPasswordId}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={savingPassword || !oldPassword || !newPassword || !confirmPassword}
            >
              {savingPassword
                ? t('common.保存中…', { defaultValue: '保存中…' })
                : t('common.修改密码', { defaultValue: '修改密码' })}
            </Button>
          </form>

          <Separator />

          <section
            className="space-y-3"
            aria-label={t('common.活跃会话', { defaultValue: '活跃设备会话' })}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Monitor className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>{t('common.活跃会话', { defaultValue: '活跃设备会话' })}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('dyna.queryRefresh', { defaultValue: '刷新数据' })}
                  disabled={loadingSessions}
                  onClick={() => void refetchSessions()}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revokingAll}
                  onClick={() => void handleRevokeAll()}
                >
                  <LogOut className="size-3.5 text-destructive" />
                  {t('common.注销全部设备', { defaultValue: '注销全部设备' })}
                </Button>
              </div>
            </div>

            <ul className="divide-y divide-border rounded-md border border-border-subtle">
              {sessions.map((session) => (
                <li
                  key={session.jti}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {summarizeUserAgent(session.userAgent)}
                      </span>
                      {session.current && (
                        <Badge variant="outline">
                          {t('common.当前会话', { defaultValue: '当前设备' })}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 tabular-nums text-muted-foreground">
                      {session.ip ?? t('common.unknownIp', { defaultValue: '未知 IP' })} ·{' '}
                      {session.loginTime.replace('T', ' ')}
                    </p>
                  </div>
                  {!session.current && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokingJti === session.jti}
                      onClick={() => void handleRevokeSession(session.jti)}
                    >
                      {t('common.下线该设备', { defaultValue: '下线' })}
                    </Button>
                  )}
                </li>
              ))}
              {!loadingSessions && sessions.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {t('common.暂无数据', { defaultValue: '暂无数据' })}
                </li>
              )}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
