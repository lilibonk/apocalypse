import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: [
      {
        jti: 's-1',
        loginTime: '2026-11-09T10:00:00',
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Chrome/130.0',
        current: true,
      },
    ],
    isFetching: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}))
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogAction: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: (
    selector: (state: {
      user: { id: string; username: string; nickname: string; deptName: string }
      roles: string[]
      ensureMe: () => Promise<void>
      clearSession: () => void
    }) => unknown,
  ) =>
    selector({
      user: { id: '1', username: 'admin', nickname: '系统管理员', deptName: '总部' },
      roles: ['super_admin'],
      ensureMe: async () => {},
      clearSession: () => {},
    }),
}))
vi.mock('@/stores/tabs', () => ({
  useTabsStore: (selector: (state: { reset: () => void }) => unknown) =>
    selector({ reset: () => {} }),
}))

import ProfilePage from './index'

describe('ProfilePage', () => {
  it('renders current user identity, profile form, password form, and active session region as a standalone page', () => {
    const html = renderToStaticMarkup(<ProfilePage />)
    expect(html).toContain('个人中心')
    expect(html).toContain('admin')
    expect(html).toContain('总部')
    expect(html).toContain('super_admin')
    expect(html).toContain('value="系统管理员"')
    expect(html).toContain('修改密码')
    expect(html).toContain('活跃设备会话')
    expect(html).toContain('当前设备')
    expect(html).toContain('注销全部设备')
  })
})
