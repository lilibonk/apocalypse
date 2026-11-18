/**
 * 登录品牌舞台：保留左侧暖象牙 Milk Cloud (`PixelOrb size={384} gaze`) 舞台与温暖文案；
 * 移除右上角悬浮 EnvPill，改为右栏表单卡片（`<SketchBox />`）下方的沉底主题世界与语言分段控制。
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
import { SketchBox } from '@/components/motion'
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
import {
  THEME_WORLDS,
  useSettings,
  useSettingsStore,
  type Language,
  type ThemeWorld,
} from '@/stores/settings'

import { LoginSubmitButton, type SubmitPhase } from './LoginSubmitButton'
import { TaglineReveal } from './TaglineReveal'

export default function LoginPage() {
  const { t } = useTranslation()
  const { t: pageT } = useTranslation('login-page')
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((state) => state.login)
  const { language, themeWorld } = useSettings()
  const setLanguage = useSettingsStore((state) => state.setLanguage)
  const setThemeWorld = useSettingsStore((state) => state.setThemeWorld)
  const motionAllowed = useMotionPreference()
  const [submitting, setSubmitting] = useState(false)
  const [orbState, setOrbState] = useState<OrbState>('idle')
  /** 密码框聚焦 → 向导闭眼回避（peek-a-boo）；仅覆盖 idle 态，不盖 waiting/success/error。 */
  const [passwordFocused, setPasswordFocused] = useState(false)
  const displayState: OrbState = passwordFocused && orbState === 'idle' ? 'sleeping' : orbState
  /** The check appears only for an accepted login (orb success), never from timers alone. */
  const submitPhase: SubmitPhase =
    orbState === 'success' ? 'success' : submitting ? 'waiting' : 'idle'

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
      if (motionAllowed) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, stateMotion.morph.duration * 1000),
        )
      }
      if (useAuthStore.getState().sessionEpoch !== acceptedEpoch) {
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
    <div
      data-theme-stage=""
      className="relative grid min-h-svh gap-6 bg-background p-4 sm:p-6 lg:grid-cols-2 lg:gap-0"
    >
      {/* 左侧互动品牌舞台：纯净主题呼吸环境光场 + 3D Milk Cloud 主角 */}
      <section className="brand-slime-stage relative hidden min-w-0 overflow-hidden rounded-panel border border-border-subtle/70 lg:flex lg:flex-col">
        <SketchBox
          seed={19}
          wash="none"
          className="flex h-full flex-col justify-between border-0 bg-transparent p-8 shadow-none xl:p-10"
          contentClassName="flex h-full flex-col justify-between"
        >
          <div
            aria-hidden="true"
            className="brand-slime-backdrop pointer-events-none absolute inset-0 z-0"
          />

          <header className="relative z-10 flex items-center justify-between gap-3">
            <BrandSignature />
          </header>

          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 py-4">
            <div className="group/mascot relative flex flex-col items-center">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-3 h-8 w-56 rounded-full bg-brand/15 blur-xl transition-transform duration-300 group-hover/mascot:scale-105"
              />
              <PixelOrb state={displayState} size={384} gaze />
            </div>

            <div className="max-w-lg space-y-2 text-center">
              <p className="inline-flex items-center rounded-full border border-border-subtle/80 bg-card/75 px-3 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground shadow-xs">
                {pageT('gestureHint')}
              </p>
              <p className="text-2xl font-semibold leading-tight tracking-tight text-balance xl:text-3xl">
                <TaglineReveal text={t('login.tagline')} animate={motionAllowed} />
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground text-balance">
                {pageT('description')}
              </p>
            </div>
          </div>

          <footer className="relative z-10 flex items-center justify-between pt-2 text-xs font-medium text-muted-foreground">
            <span>{pageT('workspace')}</span>
          </footer>
        </SketchBox>
      </section>

      <section className="relative flex min-w-0 flex-col items-center justify-between px-4 py-6 sm:px-8 lg:px-14">
        <div aria-hidden="true" className="hidden lg:block" />

        <div className="w-full max-w-sm">
          {/* 紧凑移动品牌头让输入与提交先进入视野，小角色沿原接口静态降级。 */}
          <div className="brand-slime-stage mb-6 flex items-center justify-between gap-4 rounded-panel border border-border-subtle p-4 lg:hidden">
            <BrandSignature />
            <PixelOrb state={displayState} size={64} />
          </div>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('login.welcome')}
              </h1>
              <p className="text-sm text-muted-foreground">{pageT('subtitle')}</p>
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
                          className="login-stage-input h-11 rounded-panel border-border-subtle bg-card/85 shadow-surface"
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
                          className="login-stage-input h-11 rounded-panel border-border-subtle bg-card/85 shadow-surface"
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

            <p className="border-t border-border-subtle pt-4 text-xs text-muted-foreground">
              {pageT('accessNote')}
            </p>
          </div>
        </div>

        <LoginPreferencesBar
          themeWorld={themeWorld}
          language={language}
          onThemeWorldChange={setThemeWorld}
          onLanguageChange={setLanguage}
        />
      </section>
    </div>
  )
}

function LoginPreferencesBar({
  themeWorld,
  language,
  onThemeWorldChange,
  onLanguageChange,
}: {
  themeWorld: ThemeWorld
  language: Language
  onThemeWorldChange: (world: ThemeWorld) => void
  onLanguageChange: (lang: Language) => void
}) {
  const { t: pageT } = useTranslation('login-page')
  const worldLabel = (world: ThemeWorld) =>
    world === 'fluid'
      ? pageT('worldFluid')
      : world === 'sketchbook'
        ? pageT('worldSketchbook')
        : pageT('worldObsidian')

  return (
    <footer
      data-slot="login-preferences"
      className="mt-6 flex w-full max-w-md flex-wrap items-center justify-center gap-2 rounded-panel border border-border-subtle bg-card/85 px-3 py-2 text-xs text-muted-foreground shadow-surface"
    >
      <div
        role="group"
        aria-label={pageT('world')}
        className="flex flex-wrap items-center justify-center gap-1"
      >
        {THEME_WORLDS.map((world) => (
          <button
            key={world}
            type="button"
            aria-pressed={themeWorld === world}
            onClick={() => onThemeWorldChange(world)}
            className={cn(
              'min-h-7 cursor-pointer rounded-full px-2.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              themeWorld === world && 'bg-primary/14 font-medium text-brand-text',
            )}
          >
            {worldLabel(world)}
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
              'min-h-7 cursor-pointer rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              language === lang && 'bg-muted font-medium text-foreground shadow-xs',
            )}
          >
            {lang === 'zh' ? pageT('langZh') : pageT('langEn')}
          </button>
        ))}
      </div>
    </footer>
  )
}
