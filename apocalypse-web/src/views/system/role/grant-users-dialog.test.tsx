import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GrantUsersDialog } from './index'
import type { RolePermissionOpening } from './role-permission.model'

const { editor } = vi.hoisted(() => ({ editor: vi.fn() }))

vi.mock('./RoleMembersTab', () => ({
  RoleMembersTab: (props: unknown) => {
    editor(props)
    return <div data-testid="shared-member-editor" />
  },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { sessionEpoch: number; authorizationEpoch: number }) => unknown) =>
      selector({ sessionEpoch: 8, authorizationEpoch: 1 }),
    { subscribe: () => () => {} },
  ),
}))
vi.mock('@/components/dyna', () => ({
  DynaPage: () => null,
  definePageSchema: (schema: unknown) => schema,
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/ui/dialog', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return Object.fromEntries(
    ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription'].map((name) => [
      name,
      Container,
    ]),
  )
})

beforeEach(() => editor.mockClear())

describe('list member assignment entry', () => {
  it('mounts RoleMembersTab with role opening metadata', () => {
    expect(
      renderToStaticMarkup(
        <GrantUsersDialog
          role={{ id: '9223372036854775801', roleName: '审计员' }}
          onClose={vi.fn()}
        />,
      ),
    ).toContain('shared-member-editor')
    expect(editor.mock.calls[0]![0]).toMatchObject({
      opening: { principalEpoch: 8, role: { id: '9223372036854775801', roleName: '审计员' } },
    })
  })

  it('gives every reopened dialog a fresh private baseline identity', () => {
    const render = () =>
      renderToStaticMarkup(
        <GrantUsersDialog role={{ id: '1', roleName: '审计员' }} onClose={vi.fn()} />,
      )
    render()
    render()
    const calls = editor.mock.calls as [{ opening: RolePermissionOpening }][]
    expect(calls[0]![0].opening.openId).not.toEqual(calls[1]![0].opening.openId)
  })
})
