import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { orbUnit, ORB_GRID } from '@/effects/PixelOrb/size'
import type { OrbState, PixelOrbProps } from '@/effects/PixelOrb/types'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settings'

import type { SlimeRuntime } from './runtime'
import { shouldUseRealtime } from './mode'
import './slime.css'

const subscribeMotion = (callback: () => void) => {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  return () => observer.disconnect()
}
const getMotion = () => document.documentElement.dataset.motion !== 'off'
const serverMotion = () => false

function Poster({ state }: { state: OrbState }) {
  return (
    <>
      <img
        src={`/brand/slime/${state}.png`}
        alt=""
        draggable={false}
        className="slime-poster slime-poster-light"
      />
      <img
        src={`/brand/slime/dark-${state}.png`}
        alt=""
        draggable={false}
        className="slime-poster slime-poster-dark"
      />
    </>
  )
}

function RealtimeSlime({ state, gaze }: { state: OrbState; gaze: boolean }) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<SlimeRuntime | null>(null)
  const stateRef = useRef(state)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported' | 'failed' | 'lost'>(
    'loading',
  )

  useEffect(() => {
    stateRef.current = state
    runtimeRef.current?.setState(state)
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const controller = new AbortController()
    let runtime: SlimeRuntime | undefined
    void import('./runtime')
      .then(async ({ createSlimeRuntime }) => {
        if (controller.signal.aborted) return
        runtime = await createSlimeRuntime(canvas, {
          signal: controller.signal,
          state: stateRef.current,
          gaze,
          onReady: () => {
            if (!controller.signal.aborted) setStatus('ready')
          },
          onFailure: (reason) => {
            if (!controller.signal.aborted) setStatus(reason)
          },
        })
        if (controller.signal.aborted) {
          runtime.dispose()
          return
        }
        runtime.setState(stateRef.current)
        runtimeRef.current = runtime
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus((current) => (current === 'loading' ? 'failed' : current))
      })
    return () => {
      controller.abort()
      runtime?.dispose()
      runtimeRef.current = null
    }
  }, [gaze])

  return (
    <div
      className="slime-runtime"
      data-backend={status === 'ready' ? 'webgpu' : 'static'}
      data-status={status}
    >
      {status !== 'ready' && <Poster state={state} />}
      <canvas
        ref={canvasRef}
        className="slime-canvas"
        data-ready={status === 'ready'}
        role="button"
        aria-hidden={status !== 'ready'}
        aria-label={t('brandSlime.interactive', { state: t(`brandSlime.states.${state}`) })}
        tabIndex={status === 'ready' ? 0 : -1}
      />
      {status !== 'loading' && status !== 'ready' && (
        <p className="slime-fallback" role="status">
          {t(`brandSlime.${status}`)}
        </p>
      )}
    </div>
  )
}

/** Large visible mascots opt into WebGPU. Small/hidden/reduced-motion surfaces never request a device. */
export function Slime({ state = 'idle', size = 64, gaze = false, className }: PixelOrbProps) {
  const { t } = useTranslation()
  const { motionEnabled } = useSettings()
  const reducedMotion = useReducedMotion()
  const domMotion = useSyncExternalStore(subscribeMotion, getMotion, serverMotion)
  const rootRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const resolvedSize = orbUnit(size) * ORB_GRID
  const interactive = shouldUseRealtime(
    resolvedSize,
    visible,
    motionEnabled,
    domMotion,
    reducedMotion,
  )

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={rootRef}
      className={cn('slime-mascot', className)}
      style={{ width: resolvedSize, height: resolvedSize }}
      data-mascot="mint-slime"
      data-state={state}
      data-motion={interactive ? 'on' : 'off'}
    >
      {interactive ? (
        <RealtimeSlime state={state} gaze={gaze} />
      ) : (
        <div
          role="img"
          aria-label={t('brandSlime.static', { state: t(`brandSlime.states.${state}`) })}
        >
          <Poster state={state} />
        </div>
      )}
    </div>
  )
}
