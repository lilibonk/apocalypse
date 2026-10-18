import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'
import { RoleMemberEditor } from './RoleMemberEditor'
import type { RoleMemberGraphNode } from './RoleMemberGraph'
import type { RoleGraphMutationOptions } from './use-role-graph-mutation'

type Effect = { setup: () => void | (() => void); deps: readonly unknown[] }
type ButtonProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean }
const harness = vi.hoisted(() => ({
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 4,
    meLoaded: true,
    perms: ['system:role:list', 'system:role:edit', 'system:user:list'],
  },
  listeners: new Set<
    (state: {
      sessionEpoch: number
      meLoaded: boolean
      perms: string[]
      authorizationEpoch: number
      allScopePerms: string[]
    }) => void
  >(),
  states: [] as unknown[],
  stateIndex: 0,
  changed: false,
  effects: [] as Effect[],
  previousEffects: [] as Array<Effect & { cleanup?: () => void }>,
  buttons: [] as ButtonProps[],
  graph: undefined as { nodes: RoleMemberGraphNode[]; onToggle?: (id: string) => void } | undefined,
  mutationOptions: undefined as
    RoleGraphMutationOptions<{ baselineUserIds: string[]; userIds: string[] }, void> | undefined,
  mutate: vi.fn(),
  client: undefined as QueryClient | undefined,
  baselineFetching: false,
  baseline: ['visible', 'hidden-outside-scope'],
  members: {
    list: [{ id: 'visible', username: 'VisibleMember', nickname: null, status: 1 }],
    page: 1,
    size: 4,
    total: 1,
  },
  candidates: {
    list: [{ id: 'candidate', username: 'CandidatePrivateName', nickname: null, status: 1 }],
    page: 1,
    size: 4,
    total: 1,
  },
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = harness.stateIndex++
    if (!(index in harness.states))
      harness.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      harness.states[index],
      (next: unknown) => {
        const value = typeof next === 'function' ? next(harness.states[index]) : next
        if (!Object.is(value, harness.states[index])) harness.changed = true
        harness.states[index] = value
      },
    ]
  },
  useLayoutEffect: (setup: Effect['setup'], deps: readonly unknown[] = []) =>
    harness.effects.push({ setup, deps }),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === harness.auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: Object.assign(() => harness.auth, {
    getState: () => harness.auth,
    subscribe: (listener: (state: typeof harness.auth) => void) => {
      harness.listeners.add(listener)
      return () => harness.listeners.delete(listener)
    },
  }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => harness.client,
  useQuery: ({ queryKey, enabled = true }: { queryKey: string[]; enabled?: boolean }) => ({
    data: enabled
      ? queryKey[0] === 'baseline'
        ? harness.baseline
        : queryKey[0] === 'members'
          ? harness.members
          : harness.candidates
      : undefined,
    isSuccess: enabled,
    isPending: !enabled,
    isFetching: queryKey[0] === 'baseline' && harness.baselineFetching,
    isError: false,
    error: null,
  }),
}))
vi.mock('./role-permission.queries', () => {
  const resource = (kind: string, opening: { openId: string }) => ({
    options: { queryKey: [kind, opening.openId] },
    filter: { queryKey: [kind, opening.openId] },
    activate: vi.fn(),
    deactivate: vi.fn(),
    disposeIfInactive: () => false,
  })
  return {
    ROLE_MEMBERS_PAGE_SIZE: 4,
    createRoleMemberDraftQuery: (opening: { openId: string }) => resource('baseline', opening),
    createRoleMembersQuery: (opening: { openId: string }) => resource('members', opening),
    createRoleMemberCandidatesQuery: (opening: { openId: string }) =>
      resource('candidates', opening),
  }
})
vi.mock('./use-role-graph-mutation', () => ({
  useRoleGraphMutation: (options: typeof harness.mutationOptions) => {
    harness.mutationOptions = options
    return { mutate: harness.mutate, isPending: false }
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
    harness.buttons.push(props)
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
vi.mock('./RoleMemberGraph', () => ({
  RoleMemberGraph: (props: NonNullable<typeof harness.graph>) => {
    harness.graph = props
    return (
      <div>
        {props.nodes.map((node) => (
          <span key={node.id}>{node.member?.username ?? node.id}</span>
        ))}
      </div>
    )
  },
}))

const opening = {
  role: { id: 'role-1', roleName: 'Role', roleKey: 'role', status: 1, dataScope: 'ALL' },
  openId: 'editor',
  principalEpoch: 4,
}
const callbacks = { onClose: vi.fn(), onSaved: vi.fn(), onResourceDenied: vi.fn() }
function renderEditor() {
  let html: string
  let passes = 0
  do {
    harness.changed = false
    harness.stateIndex = 0
    harness.effects = []
    harness.buttons = []
    harness.graph = undefined
    html = renderToStaticMarkup(<RoleMemberEditor opening={opening} {...callbacks} />)
    if (++passes > 12) throw new Error('Editor did not settle')
  } while (harness.changed)
  const previous = harness.previousEffects
  harness.previousEffects = harness.effects.map((effect, index) => {
    const old = previous[index]
    if (
      old &&
      old.deps.length === effect.deps.length &&
      effect.deps.every((item, dep) => Object.is(item, old.deps[dep]))
    )
      return old
    old?.cleanup?.()
    const cleanup = effect.setup()
    return { ...effect, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
  })
  previous.slice(harness.effects.length).forEach((effect) => effect.cleanup?.())
  return html
}
function click(label: string) {
  const button = harness.buttons.find(
    (item) =>
      item.children === label || (Array.isArray(item.children) && item.children.includes(label)),
  )
  expect(button, label).toBeDefined()
  expect(button!.disabled, label).not.toBe(true)
  button!.onClick!()
}

beforeEach(() => {
  harness.auth = {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    sessionEpoch: 4,
    meLoaded: true,
    perms: ['system:role:list', 'system:role:edit', 'system:user:list'],
  }
  harness.listeners.clear()
  harness.states = []
  harness.previousEffects = []
  harness.effects = []
  harness.baselineFetching = false
  harness.client = new QueryClient()
  harness.mutate.mockReset()
  Object.values(callbacks).forEach((callback) => callback.mockReset())
})

describe('member editor complete-baseline UI', () => {
  it('never offers editing from a cached baseline while its fresh read is pending', () => {
    harness.baselineFetching = true
    expect(renderEditor()).toContain('roleMemberEdit.loading')
    expect(harness.graph).toBeUndefined()
    expect(harness.buttons.some((button) => button.children === 'roleMemberEdit.save')).toBe(false)
  })

  it('adds and removes by node while preserving invisible baseline IDs in the reviewed submission', () => {
    renderEditor()
    click('roleMemberEdit.candidates')
    renderEditor()
    harness.graph!.onToggle!('candidate')
    renderEditor()
    click('roleMemberEdit.visible')
    renderEditor()
    harness.graph!.onToggle!('visible')
    renderEditor()
    click('roleMemberEdit.review')
    renderEditor()
    click('roleMemberEdit.save')
    expect(harness.mutate).toHaveBeenCalledWith({
      baselineUserIds: ['visible', 'hidden-outside-scope'],
      userIds: ['hidden-outside-scope', 'candidate'],
    })
  })

  it('terminates an editor containing candidate profiles after revoke/regrant of user:list', () => {
    renderEditor()
    click('roleMemberEdit.candidates')
    expect(renderEditor()).toContain('CandidatePrivateName')
    expect(harness.mutationOptions?.requiredPerms).toContain('system:user:list')
    harness.auth.perms = ['system:role:list', 'system:role:edit']
    harness.listeners.forEach((listener) => listener(harness.auth))
    harness.auth.perms.push('system:user:list')
    harness.listeners.forEach((listener) => listener(harness.auth))
    const html = renderEditor()
    expect(html).toContain('roleMemberEdit.denied')
    expect(html).not.toContain('CandidatePrivateName')
    expect(html).not.toContain('VisibleMember')
    expect(harness.graph).toBeUndefined()
  })

  it('requires explicit discard before leaving a dirty member graph', () => {
    renderEditor()
    harness.graph!.onToggle!('visible')
    renderEditor()
    click('roleMemberEdit.back')
    expect(renderEditor()).toContain('role="alertdialog"')
    expect(callbacks.onClose).not.toHaveBeenCalled()
  })

  it('clears editable member and candidate context after a write denial', () => {
    renderEditor()
    click('roleMemberEdit.candidates')
    renderEditor()
    harness.mutationOptions!.onDenied!.handle(new ApiError(40300, '全部数据范围不足'))
    const html = renderEditor()
    expect(callbacks.onResourceDenied).toHaveBeenCalledOnce()
    expect(html).toContain('roleMemberEdit.denied')
    expect(html).not.toContain('CandidatePrivateName')
    expect(harness.graph).toBeUndefined()
  })
})
