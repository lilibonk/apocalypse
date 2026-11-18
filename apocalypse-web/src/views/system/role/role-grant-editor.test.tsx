import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'
import type { PermissionDefinition } from '../permission/permission.types'
import { RolePermissionsTab } from './RolePermissionsTab'
import type { RoleGrant, RoleGrantsBaseline, roleGrantSubmission } from './role-grant.model'
import type { RoleGraphMutationOptions } from './use-role-graph-mutation'

type Effect = { setup: () => void | (() => void); deps: readonly unknown[] }
type ButtonProps = {
  children?: ReactNode
  onClick?: () => void
  disabled?: boolean
  'aria-label'?: string
}
type InputProps = {
  type?: string
  checked?: boolean
  disabled?: boolean
  onChange?: () => void
  'aria-label'?: string
}
type FieldsProps = {
  grant: RoleGrant
  disabled: boolean
  onChange: (patch: Partial<RoleGrant>) => void
}

const h = vi.hoisted(() => ({
  auth: {
    sessionEpoch: 4,
    authorizationEpoch: 1,
    meLoaded: true,
    perms: ['system:role:list', 'system:role:edit', 'system:permission:list'],
    allScopePerms: ['system:role:edit'],
  },
  listeners: new Set<(state: unknown) => void>(),
  states: [] as unknown[],
  index: 0,
  changed: false,
  effects: [] as Effect[],
  previous: [] as Array<Effect & { cleanup?: () => void }>,
  buttons: [] as ButtonProps[],
  inputs: [] as InputProps[],
  fields: undefined as FieldsProps | undefined,
  mutation: undefined as
    RoleGraphMutationOptions<ReturnType<typeof roleGrantSubmission>, void> | undefined,
  mutate: vi.fn(),
  client: undefined as QueryClient | undefined,
  baseline: undefined as RoleGrantsBaseline | undefined,
  definitions: [] as PermissionDefinition[],
  candidatePage: undefined as
    { list: PermissionDefinition[]; total: number; page: number; size: number } | undefined,
  fetching: false,
}))

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = h.index++
    if (!(index in h.states)) h.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      h.states[index],
      (next: unknown) => {
        const value = typeof next === 'function' ? next(h.states[index]) : next
        if (!Object.is(value, h.states[index])) h.changed = true
        h.states[index] = value
      },
    ]
  },
  useLayoutEffect: (setup: Effect['setup'], deps: readonly unknown[] = []) =>
    h.effects.push({ setup, deps }),
  useMemo: (factory: () => unknown) => factory(),
}))

vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    h.auth.meLoaded && (epoch === undefined || epoch === h.auth.authorizationEpoch),
  assertAuthorizationCurrent: () => {},
  useAuthStore: Object.assign(() => h.auth, {
    getState: () => h.auth,
    subscribe: (listener: (state: unknown) => void) => {
      h.listeners.add(listener)
      return () => h.listeners.delete(listener)
    },
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'name' in opts ? `${key}:${String(opts.name)}` : key,
    i18n: { resolvedLanguage: 'en' },
  }),
}))

vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => h.client,
  useQuery: ({ queryKey, enabled = true }: { queryKey: string[]; enabled?: boolean }) => ({
    data: queryKey[0] === 'baseline' ? h.baseline : enabled ? h.candidatePage : undefined,
    isFetching: queryKey[0] === 'baseline' && h.fetching,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('./role-grant.queries', () => {
  const resource = (kind: string, opening: { openId: string }) => ({
    options: { queryKey: [kind, opening.openId] },
    filter: { queryKey: [kind, opening.openId] },
    activate: vi.fn(),
    deactivate: vi.fn(),
    disposeIfInactive: () => false,
  })
  return {
    GRANT_PAGE_SIZE: 50,
    createRoleGrantQuery: (opening: { openId: string }) => resource('baseline', opening),
    createGrantCandidatesQuery: (opening: { openId: string }) => resource('candidates', opening),
  }
})

vi.mock('./use-role-graph-mutation', () => ({
  useRoleGraphMutation: (options: typeof h.mutation) => {
    h.mutation = options
    return { mutate: h.mutate, isPending: false }
  },
}))

vi.mock('@/lib/query/use-resource-denial', async (original) => ({
  ...(await original<typeof import('@/lib/query/use-resource-denial')>()),
  useResourceDenial: (options: { reset: () => void }) => ({
    handle: options.reset,
    isCurrent: () => true,
  }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: (props: ButtonProps) => {
    h.buttons.push(props)
    return <button disabled={props.disabled}>{props.children}</button>
  },
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputProps) => {
    h.inputs.push(props)
    return <input type={props.type} />
  },
}))

vi.mock('@/components/ui/dialog', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    ...Object.fromEntries(
      ['DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter'].map(
        (key) => [key, Container],
      ),
    ),
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
  }
})

vi.mock('@/components/ui/alert-dialog', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    ...Object.fromEntries(
      [
        'AlertDialogContent',
        'AlertDialogHeader',
        'AlertDialogTitle',
        'AlertDialogDescription',
        'AlertDialogFooter',
        'AlertDialogCancel',
      ].map((key) => [key, Container]),
    ),
    AlertDialogAction: (props: ButtonProps) => {
      h.buttons.push(props)
      return <button disabled={props.disabled}>{props.children}</button>
    },
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="alertdialog">{children}</div> : null,
  }
})

vi.mock('./RoleGrantFields', () => ({
  RoleGrantFields: (props: FieldsProps) => {
    h.fields = props
    return <div data-testid="grant-fields" />
  },
}))

const definition = (id: string): PermissionDefinition => ({
  id,
  code: `system:${id}:read`,
  name: `Definition ${id}`,
  description: null,
  moduleKey: null,
  resource: id,
  action: 'read',
  status: 1,
  lifecycle: 'ACTIVE',
  version: 2,
  supportedScopeOverrides: ['INHERIT_ROLE', 'ALL', 'DEPT', 'DEPT_AND_CHILDREN'],
  declarationSource: 'SystemPermissionActions',
  registered: true,
  referenceRoleCount: '1',
})

const grant = (permissionId: string): RoleGrant => ({
  permissionId,
  enabled: true,
  scopeOverride: 'INHERIT_ROLE',
  validFrom: null,
  validUntil: null,
})

const opening = {
  role: { id: 'role-1', roleName: 'Role', roleKey: 'role', status: 1, dataScope: 'DEPT' },
  principalEpoch: 4,
  openId: 'opening',
}

function render(
  callbacks: { onDirtyChange?: (dirty: boolean) => void; onCountChange?: (n: number) => void } = {},
) {
  let html: string
  let passes = 0
  do {
    h.changed = false
    h.index = 0
    h.buttons = []
    h.inputs = []
    h.effects = []
    h.fields = undefined
    html = renderToStaticMarkup(
      <RolePermissionsTab
        opening={opening}
        onDirtyChange={callbacks.onDirtyChange}
        onCountChange={callbacks.onCountChange}
      />,
    )
    if (++passes > 15) throw new Error('Tab state did not settle')
  } while (h.changed)
  const previous = h.previous
  h.previous = h.effects.map((effect, index) => {
    const old = previous[index]
    if (
      old &&
      old.deps.length === effect.deps.length &&
      effect.deps.every((value, i) => Object.is(value, old.deps[i]))
    )
      return old
    old?.cleanup?.()
    const cleanup = effect.setup()
    return { ...effect, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
  })
  previous.slice(h.effects.length).forEach((effect) => effect.cleanup?.())
  return html
}

function clickButton(match: string) {
  const button = h.buttons.find(
    (item) =>
      item.children === match ||
      (Array.isArray(item.children) && item.children.includes(match)) ||
      item['aria-label']?.includes(match),
  )
  expect(button, `button matching "${match}"`).toBeDefined()
  expect(button!.disabled, `button "${match}" disabled`).not.toBe(true)
  button!.onClick!()
}

beforeEach(() => {
  h.auth = {
    sessionEpoch: 4,
    authorizationEpoch: 1,
    meLoaded: true,
    perms: ['system:role:list', 'system:role:edit', 'system:permission:list'],
    allScopePerms: ['system:role:edit'],
  }
  h.listeners.clear()
  h.states = []
  h.previous = []
  h.effects = []
  h.fetching = false
  h.baseline = {
    roleId: 'role-1',
    revision: '12',
    catalogRevision: '9',
    grants: [
      { ...grant('opaque'), definition: null },
      { ...grant('known'), definition: definition('known') },
    ],
  }
  h.definitions = [definition('new')]
  h.candidatePage = { list: h.definitions, total: h.definitions.length, page: 1, size: 50 }
  h.client = new QueryClient()
  h.mutate.mockClear()
})

describe('RolePermissionsTab inline matrix', () => {
  it('never renders an editable matrix from stale baseline while fetching is true', () => {
    h.fetching = true
    const html = render()
    expect(html).toContain('authorization.readLoading')
    expect(html).not.toContain('system:known:read')
  })

  it('renders candidate matrix inline, configures rule via dialog, and submits touched delta', () => {
    const onDirtyChange = vi.fn()
    render({ onDirtyChange })

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    const html = render()
    expect(html).toContain('system:new:read')
    expect(html).toContain('system:known:read')
    expect(html).toContain('authorization.addNamed:Definition new')

    clickButton('authorization.configureWindow：Definition known')
    render()
    expect(h.fields?.disabled).toBe(false)
    h.fields!.onChange({
      scopeOverride: 'DEPT_AND_CHILDREN',
      enabled: false,
      validFrom: '2026-10-18T00:00:00Z',
    })
    render()
    clickButton('authorization.saveReview')
    render()
    clickButton('authorization.save')
    expect(h.mutate).toHaveBeenCalledExactlyOnceWith({
      expectedRevision: '12',
      expectedCatalogRevision: '9',
      upsert: [
        {
          ...grant('known'),
          scopeOverride: 'DEPT_AND_CHILDREN',
          enabled: false,
          validFrom: '2026-10-18T00:00:00Z',
        },
      ],
      remove: [],
    })
  })

  it('disables configuration fields for deprecated grants while still allowing revocation', () => {
    h.baseline!.grants[1]!.definition = { ...definition('known'), lifecycle: 'DEPRECATED' }
    const html = render()
    expect(html).toContain('authorization.DEPRECATED')
    const configBtn = h.buttons.find((b) =>
      b['aria-label']?.includes('authorization.configureWindow：Definition known'),
    )
    expect(configBtn?.disabled).toBe(true)
  })

  it('blocks saving after server conflict 40900 and preserves alert', () => {
    render()
    h.mutation!.onError!(new ApiError(40900, 'conflict'), {
      expectedRevision: '12',
      expectedCatalogRevision: '9',
      upsert: [],
      remove: [],
    })
    const html = render()
    expect(html).toContain('authorization.conflict')
    expect(html).toContain('authorization.reload')
  })

  it('locks and resets to read-only immediately when ALL-scope edit permission is revoked', () => {
    render()
    h.auth.allScopePerms = []
    h.listeners.forEach((listener) => listener(h.auth))
    const html = render()
    expect(html).toContain('authorization.readOnlyNotice')
    const windowBtn = h.buttons.find((b) =>
      b['aria-label']?.includes('authorization.configureWindow：Definition known'),
    )
    expect(windowBtn?.disabled).toBe(true)
  })
})
