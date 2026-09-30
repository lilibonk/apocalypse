import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})
describe('browser credential persistence migration', () => {
  it('discards legacy tokens and never writes credentials after memory login state changes', async () => {
    const values = new Map([
      [
        'apocalypse.auth',
        JSON.stringify({
          state: {
            tokens: { accessToken: 'legacy-only-access', refreshToken: 'legacy-only-refresh' },
          },
          version: 0,
        }),
      ],
    ])
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    vi.resetModules()
    const { useAuthStore } = await import('./auth')
    expect(useAuthStore.getState().tokens).toBeNull()
    await vi.waitFor(() => expect(values.has('apocalypse.auth')).toBe(false))
    useAuthStore.setState({
      tokens: {
        accessToken: 'new-memory-only',
        refreshToken: null,
        tokenType: 'Bearer',
        expiresIn: 60,
      },
    })
    expect(values.has('apocalypse.auth')).toBe(false)
    useAuthStore.getState().clearSession()
    expect(values.has('apocalypse.auth')).toBe(false)
  })
})
