import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { RoleBusinessPermissions } from './RoleBusinessPermissions'
import type { RoleGrantsBaseline, RoleGrant, roleGrantSubmission } from './role-grant.model'
import type { PermissionDefinition } from '../permission/permission.types'
import type { GrantNode } from './RoleGrantGraph'
import type { RoleGraphMutationOptions } from './use-role-graph-mutation'

type Effect = { setup: () => void | (() => void); deps: readonly unknown[] }
type ButtonProps = {
  children?: ReactNode
  onClick?: () => void
  disabled?: boolean
  'aria-label'?: string
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
  graph: undefined as
    | { nodes: GrantNode[]; onToggle: (id: string) => void; onSelect: (id: string) => void }
    | undefined,
  fields: undefined as
    | { grant: RoleGrant; disabled: boolean; onChange: (patch: Partial<RoleGrant>) => void }
    | undefined,
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
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }),
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
    GRANT_PAGE_SIZE: 4,
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
vi.mock('@/components/insights/InsightCard', () => ({
  InsightCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}))
vi.mock('@/components/ui/button', () => ({
  Button: (props: ButtonProps) => {
    h.buttons.push(props)
    return <button disabled={props.disabled}>{props.children}</button>
  },
}))
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
        'AlertDialogAction',
      ].map((key) => [key, Container]),
    ),
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="alertdialog">{children}</div> : null,
  }
})
vi.mock('./RolePermissionGraph', () => ({ RoleGraphPagination: () => null }))
vi.mock('./RoleGrantGraph', () => ({
  RoleGrantGraph: (props: NonNullable<typeof h.graph>) => {
    h.graph = props
    return (
      <div data-testid="grant-graph">
        {props.nodes.map((node) => (
          <span key={node.id}>{node.definition?.name ?? node.id}</span>
        ))}
      </div>
    )
  },
}))
vi.mock('./RoleGrantFields', () => ({
  RoleGrantFields: (props: NonNullable<typeof h.fields>) => {
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
const callbacks = { onEditingChange: vi.fn(), onClose: vi.fn() }
function render(presentation: 'graph' | 'list' = 'graph') {
  let html: string,
    passes = 0
  do {
    h.changed = false
    h.index = 0
    h.buttons = []
    h.effects = []
    h.graph = undefined
    h.fields = undefined
    html = renderToStaticMarkup(
      <RoleBusinessPermissions opening={opening} presentation={presentation} {...callbacks} />,
    )
    if (++passes > 15) throw new Error('Draft did not settle')
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
function click(label: string) {
  const button = h.buttons.find(
    (item) =>
      item.children === label ||
      (Array.isArray(item.children) && item.children.includes(label)) ||
      item['aria-label'] === label,
  )
  expect(button, label).toBeDefined()
  expect(button!.disabled, label).not.toBe(true)
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
  h.candidatePage = { list: h.definitions, total: h.definitions.length, page: 1, size: 4 }
  h.client = new QueryClient()
  h.mutate.mockClear()
  callbacks.onClose.mockClear()
  callbacks.onEditingChange.mockClear()
})
describe('shared complete permission grant editor', () => {
  it('does not open an editable draft from a cached baseline during its fresh fetch', () => {
    h.fetching = true
    render()
    expect(
      h.buttons.find(
        (button) =>
          Array.isArray(button.children) && button.children.includes('authorization.edit'),
      )?.disabled,
    ).toBe(true)
    expect(h.graph?.nodes.map((node) => node.id)).toEqual(['opaque', 'known'])
    expect(callbacks.onEditingChange).toHaveBeenLastCalledWith(false)
  })
  it('adds a candidate, configures its fields and submits a touched delta preserving opaque grants', () => {
    render()
    click('authorization.edit')
    render()
    click('authorization.candidates')
    render()
    h.graph!.onToggle('new')
    render()
    h.graph!.onSelect('new')
    render()
    expect(h.fields?.disabled).toBe(false)
    h.fields!.onChange({
      scopeOverride: 'DEPT_AND_CHILDREN',
      enabled: false,
      validFrom: '2026-10-18T00:00:00Z',
    })
    render()
    click('authorization.review')
    render()
    click('authorization.save')
    expect(h.mutate).toHaveBeenCalledExactlyOnceWith({
      expectedRevision: '12',
      expectedCatalogRevision: '9',
      upsert: [
        {
          ...grant('new'),
          scopeOverride: 'DEPT_AND_CHILDREN',
          enabled: false,
          validFrom: '2026-10-18T00:00:00Z',
        },
      ],
      remove: [],
    })
  })
  it('allows explicit removal of opaque grants without catalog access and keeps the remaining baseline', () => {
    h.auth.perms = ['system:role:list', 'system:role:edit']
    render()
    click('authorization.edit')
    render()
    h.graph!.onToggle('opaque')
    render()
    click('authorization.review')
    render()
    click('authorization.save')
    expect(h.mutate).toHaveBeenCalledWith({
      expectedRevision: '12',
      expectedCatalogRevision: '9',
      upsert: [],
      remove: ['opaque'],
    })
  })
  it('keeps deprecated grants removable but their configuration read only', () => {
    h.baseline!.grants[1]!.definition = { ...definition('known'), lifecycle: 'DEPRECATED' }
    render()
    click('authorization.edit')
    render()
    h.graph!.onSelect('known')
    render()
    expect(h.fields?.disabled).toBe(true)
  })
  it('requires explicit discard for a dirty draft and blocks saving after a server conflict', () => {
    render()
    click('authorization.edit')
    render()
    h.graph!.onToggle('known')
    render()
    click('authorization.close')
    expect(render()).toContain('role="alertdialog"')
    expect(callbacks.onClose).not.toHaveBeenCalled()
    h.mutation!.onError!(new ApiError(40900, 'conflict'), {
      expectedRevision: '12',
      expectedCatalogRevision: '9',
      upsert: [],
      remove: [],
    })
    expect(render()).toContain('authorization.conflict')
    expect(
      h.buttons.find(
        (button) =>
          Array.isArray(button.children) && button.children.includes('authorization.review'),
      )?.disabled,
    ).toBe(true)
  })
  it('permanently clears this draft on a rapid ALL scope revoke/regrant', () => {
    render()
    click('authorization.edit')
    render()
    h.auth.allScopePerms = []
    h.listeners.forEach((listener) => listener(h.auth))
    h.auth.allScopePerms = ['system:role:edit']
    h.listeners.forEach((listener) => listener(h.auth))
    const html = render()
    expect(html).toContain('authorization.denied')
    expect(html).not.toContain('Definition known')
    expect(h.graph).toBeUndefined()
  })
  it('offers the same add/remove workflow in list presentation', () => {
    render('list')
    click('authorization.edit')
    const html = render('list')
    expect(html).not.toContain('grant-graph')
    expect(html).toContain('system:known:read')
    click('authorization.remove')
    render('list')
    click('authorization.review')
    render('list')
    click('authorization.save')
    expect(h.mutate.mock.calls[0]![0].remove).toHaveLength(1)
  })
})
