import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
const storageKey = 'apocalypse.settings'
const preferences = {
  theme: 'dark',
  accent: 'periwinkle',
  density: 'compact',
  layout: 'mixed',
  tabsEnabled: false,
  contentWidth: 'boxed',
  fixedHeader: false,
  grayMode: true,
  motionEnabled: false,
  pixelWaveEnabled: true,
  language: 'en',
} as const

beforeEach(() => {
  vi.resetModules()
  storage.clear()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function saveLegacySettings(version: number) {
  storage.set(storageKey, JSON.stringify({ state: { ...preferences, mascotSkin: 'v4' }, version }))
}

describe('settings persistence after retiring mascot skins', () => {
  it('rehydrates every v4 preference, removes the retired field, and writes v5 storage', async () => {
    saveLegacySettings(4)
    const { useSettingsStore } = await import('../settings')

    expect(useSettingsStore.persist.hasHydrated()).toBe(true)
    expect(useSettingsStore.getState()).toMatchObject(preferences)
    expect(useSettingsStore.getState()).not.toHaveProperty('mascotSkin')
    expect(JSON.parse(storage.get(storageKey)!)).toEqual({ state: preferences, version: 5 })
  })

  it.each([0, 1, 2, 3])(
    'preserves the existing pre-v4 mint migration for version %s',
    async (version) => {
      saveLegacySettings(version)
      const { useSettingsStore } = await import('../settings')
      const migrated = { ...preferences, accent: 'mint' }

      expect(useSettingsStore.getState()).toMatchObject(migrated)
      expect(useSettingsStore.getState()).not.toHaveProperty('mascotSkin')
      expect(JSON.parse(storage.get(storageKey)!)).toEqual({ state: migrated, version: 5 })
    },
  )

  it('changing a current accent preserves other preferences without recreating skin state', async () => {
    storage.set(storageKey, JSON.stringify({ state: preferences, version: 5 }))
    const { useSettingsStore } = await import('../settings')

    useSettingsStore.getState().setAccent('rose')

    expect(useSettingsStore.getState()).toMatchObject({ ...preferences, accent: 'rose' })
    expect(useSettingsStore.getState()).not.toHaveProperty('mascotSkin')
    expect(JSON.parse(storage.get(storageKey)!)).toEqual({
      state: { ...preferences, accent: 'rose' },
      version: 5,
    })
  })
})
