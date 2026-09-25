/**
 * 用户设置只暴露主题、密度与语言。
 *
 * 布局、强调色等脚手架验证能力仅在开发环境的“外观实验室”出现，
 * 不再把实现细节暴露给正式产品用户。错误的全局反色色弱模式已移除。
 */

import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MotionCollapse } from '@/components/MotionCollapse'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { PixelScale } from '@/components/ui/pixel-scale'
import { PixelWaveLab } from '@/effects/PixelWave/PixelWaveLab'
import { cn } from '@/lib/utils'
import {
  ACCENTS,
  useSettings,
  useSettingsStore,
  type Accent,
  type ContentWidth,
  type Density,
  type Language,
  type LayoutVariant,
  type ThemeMode,
} from '@/stores/settings'

function OptionRow<T extends string>({
  value,
  options,
  onChange,
  labels,
}: {
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  labels: Record<T, string>
}) {
  return (
    <div className="flex gap-1 rounded-md border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'flex-1 rounded px-2 py-1.5 text-xs transition-colors',
            option === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{title}</Label>
      {children}
    </div>
  )
}

const ACCENT_SWATCH: Record<Accent, string> = {
  periwinkle: 'bg-indigo-300',
  mint: 'bg-teal-400',
  violet: 'bg-violet-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
  mono: 'bg-neutral-800 dark:bg-neutral-200',
}

export function SettingsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const settings = useSettings()
  const store = useSettingsStore()
  const [labOpen, setLabOpen] = useState(false)
  const ct = (key: string) => t(`common.${key}`, { defaultValue: key })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{ct('界面设置')}</SheetTitle>
          <SheetDescription>
            {t('common.调整阅读体验与界面语言', { defaultValue: '调整阅读体验与界面语言。' })}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <Section title={ct('主题')}>
            <OptionRow<ThemeMode>
              value={settings.theme}
              options={['light', 'dark', 'system']}
              labels={{ light: ct('浅色'), dark: ct('深色'), system: ct('跟随系统') }}
              onChange={store.setTheme}
            />
          </Section>

          <Section title={ct('密度')}>
            <OptionRow<Density>
              value={settings.density}
              options={['comfortable', 'compact']}
              labels={{ comfortable: ct('舒适'), compact: ct('紧凑') }}
              onChange={store.setDensity}
            />
          </Section>

          <Section title={ct('语言')}>
            <OptionRow<Language>
              value={settings.language}
              options={['zh', 'en']}
              labels={{ zh: '中文', en: 'English' }}
              onChange={store.setLanguage}
            />
          </Section>

          {import.meta.env.DEV && (
            <>
              <Separator />
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left text-sm font-medium"
                  aria-expanded={labOpen}
                  aria-controls="appearance-lab-content"
                  onClick={() => setLabOpen((value) => !value)}
                >
                  <span className="flex-1">
                    {ct('外观实验室')}
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Dev only
                    </span>
                  </span>
                  <ChevronRight
                    data-slot="motion-disclosure-indicator"
                    className={cn('size-3.5 shrink-0', labOpen && 'rotate-90')}
                  />
                </button>
                <MotionCollapse open={labOpen} id="appearance-lab-content" className="pt-1">
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t('common.仅用于验证脚手架主题能力，不属于最终用户设置。', {
                      defaultValue: '仅用于验证脚手架主题能力，不属于最终用户设置。',
                    })}
                  </p>

                  <div className="mt-4 space-y-4">
                    <section className="space-y-4 rounded-md border border-border bg-background/70 p-3">
                      <div>
                        <h3 className="text-xs font-medium">{ct('反馈与品牌')}</h3>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                          {ct('验证品牌反馈，不进入业务正文。')}
                        </p>
                      </div>

                      <Section title={ct('像素音阶')}>
                        <div className="flex items-center justify-between rounded-md border border-border px-3 py-3">
                          <span className="text-xs text-muted-foreground">
                            {ct('加载反馈预览')}
                          </span>
                          <PixelScale variant="card" />
                        </div>
                      </Section>

                      <Section title={ct('动效实验室')}>
                        <PixelWaveLab active={open && labOpen} />
                      </Section>

                      <Section title={ct('强调色')}>
                        <div className="flex flex-wrap gap-2">
                          {ACCENTS.map((accent) => (
                            <button
                              key={accent}
                              type="button"
                              aria-label={t('common.accentAria', { accent })}
                              onClick={() => store.setAccent(accent)}
                              className={cn(
                                'size-6 rounded-full transition-[box-shadow,opacity] hover:opacity-80',
                                ACCENT_SWATCH[accent],
                                settings.accent === accent &&
                                  'ring-2 ring-ring ring-offset-2 ring-offset-background',
                              )}
                            />
                          ))}
                        </div>
                      </Section>
                    </section>

                    <section className="space-y-4 rounded-md border border-border bg-background/70 p-3">
                      <div>
                        <h3 className="text-xs font-medium">{ct('布局实验')}</h3>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                          {ct('验证脚手架能力，正式产品默认收起。')}
                        </p>
                      </div>

                      <Section title={ct('布局')}>
                        <OptionRow<LayoutVariant>
                          value={settings.layout}
                          options={['sidebar', 'topbar', 'mixed']}
                          labels={{ sidebar: ct('侧栏'), topbar: ct('顶栏'), mixed: ct('混合') }}
                          onChange={store.setLayout}
                        />
                      </Section>

                      <Section title={ct('内容宽度')}>
                        <OptionRow<ContentWidth>
                          value={settings.contentWidth}
                          options={['fluid', 'boxed']}
                          labels={{ fluid: ct('通栏'), boxed: ct('限宽居中') }}
                          onChange={store.setContentWidth}
                        />
                      </Section>

                      <div className="space-y-3 border-t border-border pt-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="setting-tabs">{ct('多页签')}</Label>
                          <Switch
                            id="setting-tabs"
                            checked={settings.tabsEnabled}
                            onCheckedChange={store.setTabsEnabled}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="setting-fixed-header">{ct('固定顶栏')}</Label>
                          <Switch
                            id="setting-fixed-header"
                            checked={settings.fixedHeader}
                            onCheckedChange={store.setFixedHeader}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="setting-gray">{ct('灰色模式')}</Label>
                          <Switch
                            id="setting-gray"
                            checked={settings.grayMode}
                            onCheckedChange={store.setGrayMode}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="setting-motion">{ct('动画')}</Label>
                          <Switch
                            id="setting-motion"
                            checked={settings.motionEnabled}
                            onCheckedChange={store.setMotionEnabled}
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </MotionCollapse>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
