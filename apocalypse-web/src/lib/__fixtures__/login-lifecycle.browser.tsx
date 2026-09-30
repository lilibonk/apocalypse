import type { InternalAxiosRequestConfig } from 'axios'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { AppProviders } from '@/app/providers'
import { http } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import LoginPage from '@/views/login'
import '@/index.css'

if (!import.meta.env.DEV) throw new Error('Test fixture is dev-only')
useSettingsStore.setState({ motionEnabled: true })
useAuthStore.setState({ tokens: null, user: null, bootstrapped: true, sessionEpoch: 0 })
const pair = {
  accessToken: 'fixture-only-access',
  refreshToken: null,
  tokenType: 'Bearer',
  expiresIn: 3600,
}
let complete: ((success: boolean) => void) | undefined
let showPending: (pending: boolean) => void = () => {}
function response(config: InternalAxiosRequestConfig, data: unknown, code = 0) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    data: { code, data, message: 'Obsolete login failure' },
  }
}
http.defaults.adapter = (config) => {
  if (config.url === '/auth/browser/csrf')
    return Promise.resolve(response(config, { token: 'fixture-only-csrf' }))
  if (config.url === '/auth/browser/login')
    return new Promise((resolve) => {
      complete = (success) => {
        showPending(false)
        resolve(response(config, pair, success ? 0 : 40100))
      }
      showPending(true)
    })
  if (config.url === '/system/users/me')
    return Promise.resolve(
      response(config, {
        user: { id: '1', username: 'fixture-user', nickname: 'Fixture user' },
        roles: [],
        perms: [],
        menus: [],
      }),
    )
  return Promise.reject(new Error('Unexpected login fixture request'))
}

export function Controls() {
  const [pending, setPending] = useState(false)
  useEffect(() => {
    showPending = setPending
    return () => {
      showPending = () => {}
    }
  }, [])
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const switchAccount = () => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({
      tokens: { ...pair, accessToken: 'fixture-only-current-account' },
      user: { id: '2', username: 'current-user', nickname: 'Current user' },
      meLoaded: true,
      bootstrapped: true,
    })
  }
  return (
    <>
      <button disabled={!pending} onClick={() => complete?.(true)}>
        Finish login
      </button>
      <button disabled={!pending} onClick={() => complete?.(false)}>
        Reject login
      </button>
      <button onClick={switchAccount}>Switch account</button>
      <output data-testid="identity" data-user={user?.id ?? ''} data-route={location.pathname}>
        Fixture identity
      </output>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/protected" element={<p>Accepted navigation</p>} />
      </Routes>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/protected' } }]}>
      <Controls />
    </MemoryRouter>
  </AppProviders>,
)
