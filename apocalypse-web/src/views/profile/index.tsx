/**
 * 个人中心（独立主体页面 `/profile`）：
 * - 左栏：个人身份名片与基本资料维护（修改昵称，展示用户名/部门/当前角色）
 * - 右栏：登录密码安全修改 + 多端活跃设备会话管理（单设备下线 / 注销全部设备）
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  KeyRound,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import * as authApi from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { summarizeUserAgent } from '@/lib/user-agent'
import { useAuthStore } from '@/stores/auth'
import { useTabsStore } from '@/stores/tabs'

const SELF_SESSIONS_QUERY_KEY = ['system', 'self-sessions'] as const
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length

export default function ProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const roles = useAuthStore((state) => state.roles)
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
    if (
      newPassword.length < 8 ||
      newPassword.length > 64 ||
      !/\p{L}/u.test(newPassword) ||
      !/\p{N}/u.test(newPassword)
    ) {
      toast.error(t('common.passwordPolicyInvalid'))
      return
    }
    if (utf8Bytes(newPassword) > 72) {
      toast.error(t('common.passwordTooLongBytes'))
      return
    }
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

  const displayName = user?.nickname ?? user?.username ?? '-'
  const initial = displayName.slice(0, 1).toUpperCase() || '?'

  return (
    <div data-theme-stage="" className="w-full min-w-0 space-y-5 p-4 sm:p-6">
      <PageHeader title={t('common.个人中心', { defaultValue: '个人中心' })} />

      <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* 左栏：账户档案与昵称维护 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3.5">
              <Avatar className="size-12 border border-border-subtle shadow-xs">
                <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <CardTitle className="truncate text-base">{displayName}</CardTitle>
                <CardDescription className="truncate font-mono text-xs">
                  @{user?.username ?? '-'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-1 gap-3 rounded-control border border-border-subtle bg-muted/30 p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <UserCheck className="size-3.5" aria-hidden="true" />
                  {t('login.username', { defaultValue: '用户名' })}
                </dt>
                <dd className="font-mono font-medium text-foreground">{user?.username ?? '-'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="size-3.5" aria-hidden="true" />
                  {t('menu.部门管理', { defaultValue: '部门' })}
                </dt>
                <dd className="font-medium text-foreground">{user?.deptName ?? '-'}</dd>
              </div>
              {roles.length > 0 && (
                <div className="space-y-1.5 border-t border-border-subtle pt-2.5">
                  <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    当前持有角色
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {roles.map((roleKey) => (
                      <Badge key={roleKey} variant="secondary" className="font-mono text-[11px]">
                        {roleKey}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
            </dl>

            <Separator />

            <form onSubmit={(event) => void handleSaveProfile(event)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={nicknameId}>{t('dyna.昵称', { defaultValue: '昵称' })}</Label>
                <Input
                  id={nicknameId}
                  value={nickname}
                  maxLength={64}
                  onChange={(event) => setDraftNickname(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={savingProfile || !nickname.trim()}>
                {savingProfile
                  ? t('common.保存中…', { defaultValue: '保存中…' })
                  : t('common.保存', { defaultValue: '保存' })}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 右栏：密码安全 + 多端在线设备管理 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-brand-text" aria-hidden="true" />
                <CardTitle className="text-base">
                  {t('common.修改密码', { defaultValue: '修改密码' })}
                </CardTitle>
              </div>
              <CardDescription>
                修改密码后将递增凭证版本，所有已登录设备会话会自动下线并要求重新登录。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => void handleSavePassword(event)}
                className="grid gap-4 sm:grid-cols-3 sm:items-end"
              >
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
                    maxLength={64}
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
                    maxLength={64}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{t('common.passwordPolicyHint')}</p>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={savingPassword || !oldPassword || !newPassword || !confirmPassword}
                  >
                    {savingPassword
                      ? t('common.保存中…', { defaultValue: '保存中…' })
                      : t('common.修改密码', { defaultValue: '修改密码' })}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Monitor className="size-4 text-brand-text" aria-hidden="true" />
                  <CardTitle className="text-base">
                    {t('common.活跃会话', { defaultValue: '活跃设备会话' })}
                  </CardTitle>
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {sessions.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('dyna.queryRefresh', { defaultValue: '刷新数据' })}
                    disabled={loadingSessions}
                    onClick={() => void refetchSessions()}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={revokingAll}>
                        <LogOut className="size-3.5 text-destructive" />
                        {t('common.注销全部设备', { defaultValue: '注销全部设备' })}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认注销全部设备会话？</AlertDialogTitle>
                        <AlertDialogDescription>
                          包括当前浏览器在内的所有已登录终端都将立即失效，您需要重新登录。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void handleRevokeAll()}
                        >
                          确认注销全部
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <CardDescription>
                查看当前账号所有活跃签发会话，并可单独强制下线非本机终端。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border-subtle rounded-control border border-border-subtle">
                {sessions.map((session) => (
                  <li
                    key={session.jti}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
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
                  <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {t('common.暂无数据', { defaultValue: '暂无数据' })}
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
