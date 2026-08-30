/**
 * 登录页：分屏品牌页（≥lg 左舞台右表单，<lg 单列表单 + 紧凑品牌头）。
 *
 * 登录氛围层（v2.11 连续浪潮·铅字浮雕，规格 docs/pixel-wave-spec.md §22/§23）：
 * - PixelWave 只铺桌面品牌舞台 / 移动品牌头，表单维持纯数据表面；
 *   固定 32px 完整网格 + 随机角点欧氏波前 + rAF 连续指数长尾高度场；顶面与背景同色
 *   （白底白块 / 黑底黑块），灰阶侧壁与彩色剪影流光只表达抬升深度；
 *   组件恒 pointer-events-none、无任何鼠标涟漪 / 点击脉冲（v2.3 移除交互）；
 * - PixelOrb 256 主视觉（左舞台 z-10）：直接裁切批准设计稿的透明状态母版；idle 只移动原稿眼部高光跟随指针，不以代码重绘角色；
 *   五张角色稿随登录生命周期联动：
 *   idle → waiting → success（短暂停留后跳转）/ error（稍后回 idle）；
 * - 彩蛋：聚焦密码框时 Mint Bonk 进入 sleeping（闭眼回避），失焦恢复；
 * - BlurText 逐字揭示 tagline；底部等宽字体技术栈 meta 行。
 *
 * 表单面板（右，z-10）：排版驱动层级，无卡片套卡片；底部内嵌语言切换（与设置面板同源）。
 *
 * 降级（prefers-reduced-motion 或设置「动画」关闭）：PixelWave 零渲染纯背景、
 * BlurText 直出、PixelOrb 保持所选设计稿静态帧且视线回中，布局与功能不变（宪法 §5 双开关）。
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
import { PixelScale, PixelWave } from '@/effects/PixelWave'
import { BlurText } from '@/effects/registry/BlurText'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useSettings, useSettingsStore, type Language, type ThemeMode } from '@/stores/settings'

export default function LoginPage() {
  const { t } = useTranslation()
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
    <div className="relative grid min-h-svh bg-background lg:grid-cols-[3fr_2fr]">
      {/* 品牌舞台（≥lg）：Mint Bonk 像素向导 + 编辑式品牌排版 */}
      <section className="relative hidden overflow-hidden border-r border-border bg-background lg:flex lg:flex-col lg:justify-between lg:p-12">
        <PixelWave
          appearance="letterpress"
          waveSpeed={0.8}
          className="absolute inset-0 z-0 opacity-90"
        />

        <header className="relative z-10 flex items-start justify-between">
          <BrandSignature />
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="size-2 bg-primary" />
            {t('login.signal')}
          </div>
        </header>

        <div className="relative z-10 grid grid-cols-[auto_1fr] items-center gap-12">
          <PixelOrb state={displayState} size={256} gaze />

          <div className="max-w-lg bg-background">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {t('login.stageIndex')}
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-balance 2xl:text-5xl">
              <BlurText text={t('login.tagline')} animateBy="letters" delay={55} />
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
              {t('login.stageDesc')}
            </p>

            <dl className="mt-10 grid grid-cols-3 border-y border-border py-4">
              {(['architecture', 'runtime', 'interface'] as const).map((item) => (
                <div key={item} className="border-l border-border pl-4 first:border-l-0 first:pl-0">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t(`login.${item}Label`)}
                  </dt>
                  <dd className="mt-2 text-xs font-medium">{t(`login.${item}Value`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <footer className="relative z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{t('login.stageMeta')}</span>
          <span>CONSOLE / 01</span>
        </footer>
      </section>

      {/* 表单面板（右）：克制数据表面，保持功能优先 */}
      <section className="relative flex items-center justify-center bg-background px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/* 移动端紧凑品牌头（<lg 时舞台隐藏） */}
          <div className="relative -mx-6 mb-12 overflow-hidden border-b border-border px-6 pb-8 sm:-mx-10 sm:px-10 lg:hidden">
            <PixelWave
              appearance="letterpress"
              waveSpeed={0.8}
              className="absolute inset-0 z-0 opacity-90"
            />
            <div className="relative z-10 flex flex-col items-center gap-5 text-center">
              <BrandSignature className="self-start text-left" />
              <PixelOrb state={displayState} size={128} gaze />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t('login.edition')}
                </p>
                <p className="mt-2 text-base font-semibold">{t('login.tagline')}</p>
              </div>
            </div>
          </div>

          <div className="mb-10 border-l-2 border-primary pl-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t('login.accessIndex')}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t('login.welcome')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('login.subtitle')}</p>
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
                        placeholder="admin"
                        className="h-11"
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
                        className="h-11"
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

          <p className="mt-5 text-xs leading-5 text-muted-foreground">{t('login.accessNote')}</p>

          {/* 登录前可直接修正全局主题与语言，避免登出后落入不可调整的外观状态。 */}
          <div className="mt-10 space-y-4 border-t border-border pt-4 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-4">
              <span>{t('common.主题', { defaultValue: '主题' })}</span>
              <div className="flex items-center gap-2">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((mode, index) => (
                  <span key={mode} className="flex items-center gap-2">
                    {index > 0 && <span className="text-border">/</span>}
                    <button
                      type="button"
                      aria-pressed={theme === mode}
                      onClick={() => setTheme(mode)}
                      className={cn(
                        'transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        theme === mode && 'font-medium text-foreground',
                      )}
                    >
                      {mode === 'light'
                        ? t('common.浅色', { defaultValue: '浅色' })
                        : mode === 'dark'
                          ? t('common.深色', { defaultValue: '深色' })
                          : t('common.跟随系统', { defaultValue: '跟随系统' })}
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] uppercase tracking-widest">APOCALYPSE</span>
              <div className="flex items-center gap-2">
                {(['zh', 'en'] as Language[]).map((lang, index) => (
                  <span key={lang} className="flex items-center gap-2">
                    {index > 0 && <span className="text-border">/</span>}
                    <button
                      type="button"
                      aria-pressed={language === lang}
                      onClick={() => setLanguage(lang)}
                      className={cn(
                        'transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        language === lang && 'font-medium text-foreground',
                      )}
                    >
                      {lang === 'zh' ? '中文' : 'English'}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
