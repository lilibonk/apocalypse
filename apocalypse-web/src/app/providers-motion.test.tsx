import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  notifications: 0,
  snapshots: [] as unknown[],
}))

// Run the real settings/provider/media-query logic with a deterministic effect
// and external-store lifecycle. Browser rendering remains a separate acceptance.
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return {
    ...react,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect()
      if (cleanup) lifecycle.cleanups.push(cleanup)
    },
    useSyncExternalStore: <T,>(
      subscribe: (notify: () => void) => () => void,
      snapshot: () => T,
    ) => {
      lifecycle.cleanups.push(
        subscribe(() => {
          lifecycle.notifications += 1
          lifecycle.snapshots.push(snapshot())
        }),
      )
      return snapshot()
    },
  }
})
vi.mock('@/i18n', () => ({ default: { changeLanguage: vi.fn() } }))
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }))
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./query-client', () => ({ queryClient: {} }))

class TestMedia {
  matches = false
  listeners = new Set<() => void>()

  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener)
  }

  change(matches: boolean) {
    this.matches = matches
    for (const listener of this.listeners) listener()
  }
}

const storage = new Map<string, string>()
let root: { dataset: Record<string, string>; classList: { toggle: ReturnType<typeof vi.fn> } }
let reducedMotion: TestMedia
let colorScheme: TestMedia
let settings: typeof import('@/stores/settings')
let AppProviders: typeof import('./providers').AppProviders
let readMotionPreference: typeof import('@/hooks/useMotionPreference').useMotionPreference
let consumerMarkup: string

function cleanupConsumers() {
  for (const cleanup of lifecycle.cleanups.splice(0)) cleanup()
}

async function loadConsumers() {
  settings = await import('@/stores/settings')
  ;({ AppProviders } = await import('./providers'))
  ;({ useMotionPreference: readMotionPreference } = await import('@/hooks/useMotionPreference'))
}

function MotionProbe() {
  const effective = settings.useSettings()
  return (
    <span
      data-motion-preference={String(readMotionPreference())}
      data-layout={effective.layout}
      data-pixel-wave={String(effective.pixelWaveEnabled)}
    />
  )
}

function readConsumers() {
  cleanupConsumers()
  // Zustand's real SSR hook reads its initial snapshot. Mirror the current store
  // into that snapshot so each render exercises the real production derivation.
  Object.assign(settings.useSettingsStore.getInitialState(), settings.useSettingsStore.getState())
  consumerMarkup = renderToStaticMarkup(
    <AppProviders>
      <MotionProbe />
    </AppProviders>,
  )
  return consumerMarkup.includes('data-motion-preference="true"')
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('DEV', false)
  storage.clear()
  lifecycle.notifications = 0
  lifecycle.snapshots = []
  root = { dataset: {}, classList: { toggle: vi.fn() } }
  reducedMotion = new TestMedia()
  colorScheme = new TestMedia()
  vi.stubGlobal('document', { documentElement: root })
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    matchMedia: (query: string) =>
      query === '(prefers-reduced-motion: reduce)' ? reducedMotion : colorScheme,
  })
})

afterEach(() => {
  cleanupConsumers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('product motion preference reaches CSS and JavaScript consumers', () => {
  it.each([false, true])(
    'applies the shared preference when DEV=%s and allows re-enabling',
    async (dev) => {
      vi.stubEnv('DEV', dev)
      await loadConsumers()
      expect(readConsumers()).toBe(true)
      expect(root.dataset.motion).toBe('on')

      // Both the command action and settings Switch use this real store action.
      settings.useSettingsStore.getState().setMotionEnabled(false)
      expect(readConsumers()).toBe(false)
      expect(root.dataset.motion).toBe('off')
      expect(JSON.parse(storage.get('apocalypse.settings')!).state.motionEnabled).toBe(false)

      settings.useSettingsStore.getState().setMotionEnabled(true)
      expect(readConsumers()).toBe(true)
      expect(root.dataset.motion).toBe('on')
    },
  )

  it('honors a persisted disabled preference in production while keeping lab settings fixed', async () => {
    storage.set(
      'apocalypse.settings',
      JSON.stringify({
        version: 5,
        state: { motionEnabled: false, accent: 'rose', layout: 'mixed', pixelWaveEnabled: true },
      }),
    )
    await loadConsumers()
    expect(settings.useSettingsStore.persist.hasHydrated()).toBe(true)
    expect(readConsumers()).toBe(false)
    expect(root.dataset.motion).toBe('off')
    expect(root.dataset.accent).toBe('mint')
    expect(consumerMarkup).toContain('data-layout="sidebar"')
    expect(consumerMarkup).toContain('data-pixel-wave="false"')
  })

  it('keeps the OS preference authoritative without overwriting the product choice', async () => {
    await loadConsumers()
    expect(readConsumers()).toBe(true)
    expect(reducedMotion.listeners.size).toBe(1)

    const beforeOsChange = lifecycle.notifications
    reducedMotion.change(true)
    expect(lifecycle.notifications).toBeGreaterThan(beforeOsChange)
    expect(lifecycle.snapshots.at(-1)).toBe(true)
    expect(readConsumers()).toBe(false)
    expect(root.dataset.motion).toBe('on')
    expect(settings.useSettingsStore.getState().motionEnabled).toBe(true)

    reducedMotion.change(false)
    expect(readConsumers()).toBe(true)
    settings.useSettingsStore.getState().setMotionEnabled(false)
    expect(readConsumers()).toBe(false)
    reducedMotion.change(true)
    expect(readConsumers()).toBe(false)
    reducedMotion.change(false)
    expect(readConsumers()).toBe(false)
    expect(root.dataset.motion).toBe('off')
    expect(JSON.parse(storage.get('apocalypse.settings')!).state.motionEnabled).toBe(false)

    cleanupConsumers()
    expect(reducedMotion.listeners.size).toBe(0)
    expect(colorScheme.listeners.size).toBe(0)
    const afterUnmount = lifecycle.notifications
    reducedMotion.change(true)
    expect(lifecycle.notifications).toBe(afterUnmount)
  })

  it('retains capability trimming without bypassing system reduced motion', async () => {
    await loadConsumers()
    settings.useSettingsStore.getState().setMotionEnabled(false)
    const capability = settings.CAPABILITY_META.find(({ key }) => key === 'motion')!
    const originalExposure = capability.exposed
    capability.exposed = false
    try {
      expect(readConsumers()).toBe(settings.DEFAULT_SETTINGS.motionEnabled)
      expect(root.dataset.motion).toBe('on')
      expect(settings.useSettingsStore.getState().motionEnabled).toBe(false)
      reducedMotion.change(true)
      expect(readConsumers()).toBe(false)
      expect(root.dataset.motion).toBe('on')
    } finally {
      capability.exposed = originalExposure
    }
  })
})
