/**
 * 登录品牌舞台：LIL-85 WebGPU 软体史莱姆；表单与认证流程保持原契约。
 * 五种表情跟随登录生命周期，密码聚焦时闭眼。小尺寸/减少动效使用新角色静态海报。
 * 保留 gaze 视线跟随；PixelWave 仅在动效实验室预览，登录不挂载。
 */

import { submitForm } from '@/lib/form-submit'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { stateMotion } from '@/design/motion'
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
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useAuthStore } from '@/stores/auth'
import { useSettings, useSettingsStore, type Language, type ThemeMode } from '@/stores/settings'

import { LoginSubmitButton, type SubmitPhase } from './LoginSubmitButton'
import { TaglineReveal } from './TaglineReveal'

export default function LoginPage() {
  const { t } = useTranslation()
  const { t: pageT } = useTranslation('login-page')
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((state) => state.login)
  const { language, theme } = useSettings()
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const motionAllowed = useMotionPreference()
  const [submitting, setSubmitting] = useState(false)
  const [orbState, setOrbState] = useState<OrbState>('idle')
  /** 密码框聚焦 → 向导闭眼回避（peek-a-boo）；仅覆盖 idle 态，不盖 waiting/success/error。 */
  const [passwordFocused, setPasswordFocused] = useState(false)
  const displayState: OrbState = passwordFocused && orbState === 'idle' ? 'sleeping' : orbState
  /** The check appears only for an accepted login (orb success), never from timers alone. */
  const submitPhase: SubmitPhase =
    orbState === 'success' ? 'success' : submitting ? 'waiting' : 'idle'

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
    // aria-disabled keeps focus on the button, so duplicate submits are refused here.
    if (submitting) return
    setSubmitting(true)
    setOrbState('waiting')
    try {
      const accepted = await login(values.username, values.password)
      if (!accepted) {
        setOrbState('idle')
        return
      }
      const acceptedEpoch = useAuthStore.getState().sessionEpoch
      setOrbState('success')
      // 动效可用时短暂停留展示 success 态，否则立即跳转
      if (motionAllowed) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, stateMotion.morph.duration * 1000),
        )
      }
      if (useAuthStore.getState().sessionEpoch !== acceptedEpoch) {
        // Identity changed during the success dwell: no navigation and no stale success state.
        setOrbState('idle')
        return
      }
      navigate(from, { replace: true })
    } catch (error) {
      setOrbState('error')
      toast.error(error instanceof ApiError ? error.message : t('login.failed'))
      form.setFocus('password')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <div className="relative grid min-h-svh gap-6 bg-background p-4 sm:p-6 lg:grid-cols-2 lg:gap-0">
      <LoginEnvPill
        theme={theme}
        language={language}
        onThemeChange={setTheme}
        onLanguageChange={setLanguage}
      />

      {/* 实色品牌舞台保留独立 Milk Cloud 接口；正文不叠加玻璃。 */}
      <section className="brand-slime-stage relative hidden min-w-0 overflow-hidden rounded-panel lg:flex lg:flex-col lg:justify-between lg:p-8 xl:p-10">
        <header className="relative z-10">
          <BrandSignature />
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 py-4">
          <div className="group/mascot flex flex-col items-center">
            <PixelOrb state={displayState} size={384} gaze />
          </div>

          <div className="max-w-lg text-center">
            <p className="text-2xl font-semibold leading-tight tracking-tight text-balance xl:text-3xl">
              <TaglineReveal text={t('login.tagline')} animate={motionAllowed} />
            </p>
          </div>
        </div>
      </section>

      <section className="relative flex min-w-0 items-center justify-center px-2 py-6 sm:px-8 lg:px-12">
        <div className="w-full max-w-sm">
          {/* 紧凑移动品牌头让输入与提交先进入视野，小角色沿原接口静态降级。 */}
          <div className="brand-slime-stage mb-8 flex items-center justify-between gap-4 rounded-panel border border-border-subtle p-4 lg:hidden">
            <BrandSignature />
            <PixelOrb state={displayState} size={64} />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">{t('login.welcome')}</h1>
          </div>

          <Form {...form}>
            <form
              onSubmit={(event) => submitForm(onSubmit(event), t('login.failed'))}
              className="space-y-5"
            >
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
              <LoginSubmitButton phase={submitPhase} morph={motionAllowed} />
            </form>
          </Form>
        </div>
      </section>
    </div>
  )
}

function LoginEnvPill({
  theme,
  language,
  onThemeChange,
  onLanguageChange,
}: {
  theme: ThemeMode
  language: Language
  onThemeChange: (mode: ThemeMode) => void
  onLanguageChange: (lang: Language) => void
}) {
  const { t: pageT } = useTranslation('login-page')
  return (
    <div
      data-slot="login-env-pill"
      className="fixed top-4 right-4 z-20 flex flex-wrap items-center gap-1.5 rounded-full border border-border-subtle bg-card/85 p-1 text-xs text-muted-foreground shadow-floating backdrop-blur-md"
    >
      <div role="group" aria-label={pageT('theme')} className="flex items-center gap-0.5">
        {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={theme === mode}
            onClick={() => onThemeChange(mode)}
            className={cn(
              'min-h-7 rounded-full px-2.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              theme === mode && 'bg-muted font-medium text-foreground shadow-xs',
            )}
          >
            {mode === 'light'
              ? pageT('themeLight')
              : mode === 'dark'
                ? pageT('themeDark')
                : pageT('themeSystem')}
          </button>
        ))}
      </div>
      <span aria-hidden="true" className="h-3.5 w-px bg-border-subtle" />
      <div role="group" aria-label={pageT('language')} className="flex items-center gap-0.5">
        {(['zh', 'en'] as Language[]).map((lang) => (
          <button
            key={lang}
            type="button"
            aria-pressed={language === lang}
            onClick={() => onLanguageChange(lang)}
            className={cn(
              'min-h-7 rounded-full px-2.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              language === lang && 'bg-muted font-medium text-foreground shadow-xs',
            )}
          >
            {lang === 'zh' ? pageT('langZh') : pageT('langEn')}
          </button>
        ))}
      </div>
    </div>
  )
}
