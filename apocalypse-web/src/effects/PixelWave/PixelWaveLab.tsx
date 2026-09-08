/** 开发态实验室专用预览；不控制登录页或其它业务表面。 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { isCapabilityExposed, useSettings, useSettingsStore } from '@/stores/settings'

import { PixelWave } from './PixelWave'

export function PixelWaveLab({ active }: { active: boolean }) {
  const id = useId()
  const { t } = useTranslation()
  const { pixelWaveEnabled } = useSettings()
  const setPixelWaveEnabled = useSettingsStore((state) => state.setPixelWaveEnabled)
  if (!import.meta.env.DEV || !isCapabilityExposed('pixelWave')) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{t('common.像素浪潮', { defaultValue: '像素浪潮' })}</Label>
        <Switch id={id} checked={pixelWaveEnabled} onCheckedChange={setPixelWaveEnabled} />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {t('common.仅在实验室预览，默认关闭，不在登录页展示。', {
          defaultValue: '仅在实验室预览，默认关闭，不在登录页展示。',
        })}
      </p>
      {active && pixelWaveEnabled && (
        <div
          role="img"
          aria-label={t('common.像素浪潮预览', { defaultValue: '像素浪潮预览' })}
          className="relative h-48 overflow-hidden rounded-md border border-border bg-background"
        >
          <PixelWave appearance="letterpress" waveSpeed={0.8} className="absolute inset-0" />
        </div>
      )}
    </div>
  )
}
