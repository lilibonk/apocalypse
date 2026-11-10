import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { attemptPreloadRecovery, installPreloadRecovery } from '@/lib/preload-recovery'
import { RouteErrorBoundary } from './RouteErrorBoundary'

describe('RouteErrorBoundary & PreloadRecovery', () => {
  it('renders route children normally when no error occurs', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/system/user']}>
        <RouteErrorBoundary>
          <div data-slot="healthy-route">正常页面内容</div>
        </RouteErrorBoundary>
      </MemoryRouter>,
    )
    expect(html).toContain('data-slot="healthy-route"')
    expect(html).toContain('正常页面内容')
  })

  it('reloads once on vite:preloadError and prevents infinite reload loops on the same route', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    const listeners = new Map<string, EventListener>()
    const target = {
      addEventListener: ((type: string, listener: EventListener) => {
        listeners.set(type, listener)
      }) as Window['addEventListener'],
      removeEventListener: ((type: string) => {
        listeners.delete(type)
      }) as Window['removeEventListener'],
      location: { pathname: '/system/user', search: '?page=2', reload },
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      },
    }

    const cleanup = installPreloadRecovery(target)
    const event1 = new Event('vite:preloadError', { cancelable: true })
    listeners.get('vite:preloadError')?.(event1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(event1.defaultPrevented).toBe(true)

    // Second failure on the exact same route must not loop-reload
    expect(attemptPreloadRecovery(target)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    cleanup()
  })
})
