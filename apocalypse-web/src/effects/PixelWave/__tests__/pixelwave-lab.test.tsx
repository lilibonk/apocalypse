import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { CAPABILITY_META, DEFAULT_SETTINGS, useSettings, useSettingsStore } from '@/stores/settings'

import { PixelWaveLab } from '../PixelWaveLab'

function SettingsProbe() {
  return <span>{String(useSettings().pixelWaveEnabled)}</span>
}

// Configure both the client state and the server snapshot for real-hook SSR smoke tests.
const setPreviewEnabled = (enabled: boolean) => {
  useSettingsStore.setState({ pixelWaveEnabled: enabled })
  useSettingsStore.getInitialState().pixelWaveEnabled = enabled
}

afterEach(() => {
  setPreviewEnabled(false)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('像素浪潮只作为默认关闭的实验室预览', () => {
  it('默认关闭，未开启不创建 Canvas', () => {
    expect(DEFAULT_SETTINGS.pixelWaveEnabled).toBe(false)
    const html = renderToStaticMarkup(<PixelWaveLab active />)
    expect(html).toContain('aria-checked="false"')
    expect(html).not.toContain('<canvas')
  })
  it('开启只挂载预览，收起或关闭后立刻卸载', () => {
    setPreviewEnabled(true)
    expect(renderToStaticMarkup(<PixelWaveLab active />)).toContain('data-effect="pixel-wave"')
    expect(renderToStaticMarkup(<PixelWaveLab active={false} />)).not.toContain('<canvas')
    setPreviewEnabled(false)
    expect(renderToStaticMarkup(<PixelWaveLab active />)).not.toContain('<canvas')
  })
  it('裁剪后隐藏开关，读取强制关闭', () => {
    const capability = CAPABILITY_META.find(({ key }) => key === 'pixelWave')!
    setPreviewEnabled(true)
    capability.exposed = false
    try {
      expect(renderToStaticMarkup(<PixelWaveLab active />)).toBe('')
      expect(renderToStaticMarkup(<SettingsProbe />)).toContain('false')
    } finally {
      capability.exposed = true
    }
  })
  it('生产环境不暴露实验室且忽略历史开启值', () => {
    vi.stubEnv('DEV', false)
    setPreviewEnabled(true)
    expect(renderToStaticMarkup(<PixelWaveLab active />)).toBe('')
    expect(renderToStaticMarkup(<SettingsProbe />)).toContain('false')
  })
})
