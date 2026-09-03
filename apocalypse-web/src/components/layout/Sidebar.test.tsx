import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import type { MenuNode } from '@/lib/api/types'
import { Sidebar } from './Sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/hooks/useMenuTitle', () => ({ useMenuTitle: () => (title: string) => title }))
vi.mock('@/components/MotionCollapse', () => ({
  MotionCollapse: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}))
const menu = (name: string, path: string, children: MenuNode[] = []): MenuNode => ({
  id: name,
  parentId: '0',
  menuName: name,
  path,
  children,
  menuType: children.length ? 'C' : 'M',
  component: null,
  perms: null,
  icon: null,
  moduleKey: null,
  sort: 0,
})
const menus = [
  menu('系统管理', '/system', [menu('用户管理', 'user')]),
  menu('万年历', '/calendar', [
    menu('日历视图', '/calendar'),
    menu('业务日期覆盖', '/calendar/managed-overrides'),
  ]),
]
function render(path: string, collapsed = false) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Sidebar menus={menus} collapsed={collapsed} />
      </TooltipProvider>
    </MemoryRouter>,
  )
}
describe('sidebar disclosure and route selection', () => {
  it('starts with all groups collapsed on the dashboard', () => {
    const html = render('/dashboard')
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2)
    expect(html).not.toContain('href="/calendar"')
  })
  it.each([false, true])('marks only the exact leaf active (collapsed=%s)', (collapsed) => {
    const html = render('/calendar/managed-overrides', collapsed)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/href="\/calendar\/managed-overrides"/)
    expect(html).not.toMatch(/aria-current="page"[^>]*href="\/calendar"/)
    if (!collapsed) {
      expect(html.match(/aria-expanded="true"/g)).toHaveLength(1)
      expect(html.match(/aria-expanded="false"/g)).toHaveLength(1)
    }
  })
})
