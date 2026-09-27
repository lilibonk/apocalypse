/**
 * 登录品牌舞台：LIL-85 WebGPU 软体史莱姆；表单与认证流程保持原契约。
 * 五种表情跟随登录生命周期，密码聚焦时闭眼。小尺寸/减少动效使用新角色静态海报。
 * 保留 gaze 视线跟随；PixelWave 仅在动效实验室预览，登录不挂载。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { BrandSignature } from '@/components/BrandSignature'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PixelOrb, type OrbState } from '@/effects/PixelOrb'
import { PixelScale } from '@/effects/PixelWave'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useSettings, useSettingsStore, type Language, type ThemeMode } from '@/stores/settings'

import { TaglineReveal } from './TaglineReveal'

export default function LoginPage() {
  const { t } = useTranslation()
  const { t: pageT } = useTranslation('login-page')
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((state) => state.login)
  const { motionEnabled, language, theme } = useSettings()
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const reducedMotion = useReducedMotion()
  const [submitting, setSubmitting] = useState(false)
  const [orbState, setOrbState] = useState<OrbState>('idle')
  /** 密码框聚焦 → 向导闭眼回避（peek-a-boo）；仅覆盖 idle 态，不盖 waiting/success/error。 */
  const [passwordFocused, setPasswordFocused] = useState(false)
  const displayState: OrbState = passwordFocused && orbState === 'idle' ? 'sleeping' : orbState

  // error 态短暂停留后自动回 idle；timer 收在 effect 里（渲染期访问 ref 会触发 react-hooks/refs）
  useEffect(() => {
    if (orbState !== 'error') return
    const timer = window.setTimeout(() => setOrbState('idle'), 1200)
    return () => window.clearTimeout(timer)
  }, [orbState])

  // 校验消息随语言切换重建（zodResolver 持有消息闭包）
  const loginSchema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, t('login.usernameRequired')),
        password: z.string().min(1, t('login.passwordRequired')),
      }),
    [t],
  )
  type LoginValues = z.infer<typeof loginSchema>

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    setOrbState('waiting')
    try {
      await login(values.username, values.password)
      setOrbState('success')
      // 动效可用时短暂停留展示 success 态，否则立即跳转
      if (motionEnabled && !reducedMotion) {
        await new Promise((resolve) => window.setTimeout(resolve, 600))
      }
      navigate(from, { replace: true })
    } catch (error) {
      setOrbState('error')
      toast.error(error instanceof ApiError ? error.message : t('login.failed'))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <div className="relative grid min-h-svh gap-6 bg-background p-4 sm:p-6 lg:grid-cols-2 lg:gap-0">
      {/* 实色品牌舞台保留独立 Milk Cloud 接口；正文不叠加玻璃。 */}
      <section className="brand-slime-stage relative hidden min-w-0 overflow-hidden rounded-panel lg:flex lg:flex-col lg:justify-between lg:p-8 xl:p-10">
        <header className="relative z-10">
          <BrandSignature />
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 py-4">
          <div className="group/mascot flex flex-col items-center">
            <PixelOrb state={displayState} size={384} gaze />
            <p className="invisible text-xs text-muted-foreground group-has-[[data-backend=webgpu]]/mascot:visible">
              {t('brandSlime.hint')}
            </p>
          </div>

          <div className="max-w-lg text-center">
            <p className="text-2xl font-semibold leading-tight tracking-tight text-balance xl:text-3xl">
              <TaglineReveal text={t('login.tagline')} animate={motionEnabled && !reducedMotion} />
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              {pageT('description')}
            </p>
          </div>
        </div>

        <footer className="relative z-10 pt-4 text-xs text-muted-foreground">
          {pageT('workspace')}
        </footer>
      </section>

      <section className="relative flex min-w-0 items-center justify-center px-2 py-6 sm:px-8 lg:px-12">
        <div className="w-full max-w-sm">
          {/* 紧凑移动品牌头让输入与提交先进入视野，小角色沿原接口静态降级。 */}
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <BrandSignature />
            <PixelOrb state={displayState} size={64} />
          </div>

          <div className="mb-8 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t('login.welcome')}</h1>
            <p className="text-sm text-muted-foreground">{pageT('subtitle')}</p>
          </div>

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.username')}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="username"
                        placeholder={pageT('usernamePlaceholder')}
                        className="h-11 bg-card"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.password')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        className="h-11 bg-card"
                        {...field}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => {
                          field.onBlur()
                          setPasswordFocused(false)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="h-11 w-full" disabled={submitting}>
                {submitting && <PixelScale variant="inline" tone="current" />}
                {submitting ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>
          </Form>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">{pageT('accessNote')}</p>

          {/* 登录前可直接修正全局主题与语言，避免登出后落入不可调整的外观状态。 */}
          <div className="mt-8 space-y-3 border-t border-border pt-5 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{pageT('theme')}</span>
              <div
                role="group"
                aria-label={pageT('theme')}
                className="flex items-center gap-1 rounded-lg bg-muted p-1"
              >
                {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={theme === mode}
                    onClick={() => setTheme(mode)}
                    className={cn(
                      'min-h-9 rounded-md px-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      theme === mode && 'bg-card font-medium text-foreground shadow-sm',
                    )}
                  >
                    {mode === 'light'
                      ? t('common.浅色', { defaultValue: '浅色' })
                      : mode === 'dark'
                        ? t('common.深色', { defaultValue: '深色' })
                        : t('common.跟随系统', { defaultValue: '跟随系统' })}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{pageT('language')}</span>
              <div
                role="group"
                aria-label={pageT('language')}
                className="flex items-center gap-1 rounded-lg bg-muted p-1"
              >
                {(['zh', 'en'] as Language[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={language === lang}
                    onClick={() => setLanguage(lang)}
                    className={cn(
                      'min-h-9 rounded-md px-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      language === lang && 'bg-card font-medium text-foreground shadow-sm',
                    )}
                  >
                    {lang === 'zh' ? '中文' : 'English'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
