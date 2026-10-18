import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RolePermissionWorkspace } from './RolePermissionWorkspace'

type Effect = { setup: () => void | (() => void); deps: readonly unknown[] }
type ButtonProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean }
const harness = vi.hoisted(() => ({
  stateIndex: 0,
  states: [] as unknown[],
  effects: [] as Effect[],
  previousEffects: [] as Array<Effect & { cleanup?: () => void }>,
  buttons: [] as ButtonProps[],
  menuEditing: undefined as ((editing: boolean) => void) | undefined,
  memberEditing: undefined as ((editing: boolean) => void) | undefined,
  closeCommand: undefined as (() => void) | undefined,
  params: new URLSearchParams(),
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 8,
    meLoaded: true,
    perms: ['system:role:list', 'system:menu:list', 'system:role:add'],
  },
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  // Persist only Workspace's local state, allowing the regression to replay an old child's cleanup.
  useState: (initial: unknown) => {
    const index = harness.stateIndex++
    if (!(index in harness.states))
      harness.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      harness.states[index],
      (next: unknown) => {
        harness.states[index] = typeof next === 'function' ? next(harness.states[index]) : next
      },
    ]
  },
  useLayoutEffect: (setup: Effect['setup'], deps: readonly unknown[] = []) =>
    harness.effects.push({ setup, deps }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ cancelQueries: vi.fn(), removeQueries: vi.fn() }),
  useQuery: () => ({
    data: {
      list: [
        {
          id: '1',
          roleName: '管理员',
          roleKey: 'admin',
          status: 1,
          dataScope: 'ALL',
          authorizationRevision: '12',
          sort: 0,
          remark: null,
        },
      ],
      total: 1,
    },
    dataUpdatedAt: Date.now(),
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('react-router', () => ({
  useSearchParams: () => [harness.params, vi.fn()],
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
  }),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === harness.auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: Object.assign(() => harness.auth, {
    getState: () => harness.auth,
    subscribe: () => () => {},
  }),
}))
vi.mock('@/lib/query/use-resource-denial', () => ({
  isResourceDenied: () => false,
  useResourceDenial: () => ({ handle: vi.fn(), isCurrent: () => true }),
}))
vi.mock('./role-permission.queries', () => ({
  ROLE_CHOICES_PAGE_SIZE: 4,
  createRoleChoicesQuery: () => ({
    options: {},
    filter: {},
    activate: vi.fn(),
    deactivate: vi.fn(),
    disposeIfInactive: () => false,
  }),
}))
vi.mock('./RolePermissionGraph', () => ({
  RoleGraphPagination: () => null,
  RolePermissionGraph: () => null,
}))
vi.mock('./RoleMemberRelations', () => ({
  RoleMemberRelations: ({ onEditingChange }: { onEditingChange: (editing: boolean) => void }) => {
    harness.memberEditing = onEditingChange
    return null
  },
}))
vi.mock('./RoleBusinessPermissions', () => ({
  RoleBusinessPermissions: ({
    onEditingChange,
  }: {
    onEditingChange: (editing: boolean) => void
  }) => {
    harness.menuEditing = onEditingChange
    return null
  },
}))
vi.mock('./RolePermissionView', () => ({
  RolePermissionView: ({ onEditingChange }: { onEditingChange: (editing: boolean) => void }) => {
    harness.menuEditing = onEditingChange
    return null
  },
}))
vi.mock('./role-graph-crud', () => ({
  RoleGraphObjectActions: () => null,
  RoleGraphCrudPanel: ({ onClose }: { onClose: () => void }) => {
    harness.closeCommand = onClose
    return <div>Object editor</div>
  },
}))
vi.mock('@/components/ui/button', () => ({
  Button: (props: ButtonProps) => {
    harness.buttons.push(props)
    return <button disabled={props.disabled}>{props.children}</button>
  },
}))

function renderWorkspace(onBusyChange: (busy: boolean) => void) {
  harness.stateIndex = 0
  harness.effects = []
  harness.buttons = []
  const html = renderToStaticMarkup(
    <RolePermissionWorkspace principalEpoch={8} viewControl={null} onBusyChange={onBusyChange} />,
  )
  harness.previousEffects = harness.effects.map((current, index) => {
    const previous = harness.previousEffects[index]
    if (
      previous &&
      current.deps.length === previous.deps.length &&
      current.deps.every((value, item) => Object.is(value, previous.deps[item]))
    )
      return previous
    previous?.cleanup?.()
    const cleanup = current.setup()
    return { ...current, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
  })
  return html
}

beforeEach(() => {
  harness.states = []
  harness.effects = []
  harness.previousEffects = []
  harness.params = new URLSearchParams()
  harness.menuEditing = undefined
  harness.memberEditing = undefined
  harness.closeCommand = undefined
  vi.stubGlobal('requestAnimationFrame', vi.fn())
})

describe('role workspace editing lock', () => {
  it('keeps the outer view locked when an old menu view cleans up after a role draft opens', () => {
    const onBusyChange = vi.fn()
    renderWorkspace(onBusyChange)
    const oldMenuCleanup = harness.menuEditing!
    const create = harness.buttons.find(
      (button) => Array.isArray(button.children) && button.children.includes('新增角色'),
    )!
    create.onClick!()
    expect(renderWorkspace(onBusyChange)).toContain('Object editor')
    expect(onBusyChange).toHaveBeenLastCalledWith(true)

    oldMenuCleanup(false)
    renderWorkspace(onBusyChange)
    expect(onBusyChange).toHaveBeenLastCalledWith(true)

    harness.closeCommand!()
    renderWorkspace(onBusyChange)
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })

  it('also locks and unlocks the outer view for relationship editing alone', () => {
    const onBusyChange = vi.fn()
    renderWorkspace(onBusyChange)
    harness.menuEditing!(true)
    renderWorkspace(onBusyChange)
    expect(onBusyChange).toHaveBeenLastCalledWith(true)
    harness.menuEditing!(false)
    renderWorkspace(onBusyChange)
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })

  it('locks member editing and does not let a departing member view unlock an object draft', () => {
    harness.params = new URLSearchParams('roleRelation=members')
    const onBusyChange = vi.fn()
    renderWorkspace(onBusyChange)
    const oldMemberCleanup = harness.memberEditing!
    harness.memberEditing!(true)
    renderWorkspace(onBusyChange)
    expect(onBusyChange).toHaveBeenLastCalledWith(true)
    harness.memberEditing!(false)
    renderWorkspace(onBusyChange)
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
    const create = harness.buttons.find(
      (button) => Array.isArray(button.children) && button.children.includes('新增角色'),
    )!
    create.onClick!()
    renderWorkspace(onBusyChange)
    oldMemberCleanup(false)
    renderWorkspace(onBusyChange)
    expect(onBusyChange).toHaveBeenLastCalledWith(true)
  })
})
