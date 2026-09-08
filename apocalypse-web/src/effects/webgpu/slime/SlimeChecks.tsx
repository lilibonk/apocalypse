/** Local QA document only: mounts the real product wrapper without an application/auth route. */
import { useState } from 'react'

import '@/i18n'
import type { OrbState } from '@/effects/PixelOrb/types'
import { SettingsDrawer } from '@/components/layout/SettingsDrawer'
import { useSettings, useSettingsStore } from '@/stores/settings'

import { Slime } from './Slime'

export function SlimeChecks() {
  const [state, setState] = useState<OrbState>('idle')
  const [mounted, setMounted] = useState(true)
  const [domOff, setDomOff] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { motionEnabled } = useSettings()
  return (
    <section aria-label="真实组件生命周期检查">
      <div className="slime-preview-controls">
        {import.meta.env.DEV && (
          <button type="button" onClick={() => setSettingsOpen(true)}>
            打开界面设置
          </button>
        )}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => useSettingsStore.getState().setMotionEnabled(!motionEnabled)}
          >
            {motionEnabled ? '关闭全局动画' : '开启全局动画'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            document.documentElement.dataset.motion = domOff ? 'on' : 'off'
            setDomOff(!domOff)
          }}
        >
          {domOff ? '开启 DOM 动画' : '关闭 DOM 动画'}
        </button>
        <button type="button" onClick={() => setMounted(!mounted)}>
          {mounted ? '卸载角色' : '挂载角色'}
        </button>
        {(['idle', 'waiting', 'success', 'error', 'sleeping'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setState(value)}
          >{`组件 ${value}`}</button>
        ))}
      </div>
      {!import.meta.env.DEV && <p>生产版沿用产品默认动画设置；设置面板总开关在开发预览中检查。</p>}
      <div className="flex flex-wrap items-center justify-center gap-4">
        {mounted && <Slime state={state} size={384} gaze />}
        <Slime state={state} size={64} />
      </div>
      {import.meta.env.DEV && <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </section>
  )
}
