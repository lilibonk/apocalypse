import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'
import { RoleMembersTab } from './RoleMembersTab'
import type { RoleGraphMutationOptions } from './use-role-graph-mutation'

type Effect = { setup: () => void | (() => void); deps: readonly unknown[] }
type ButtonProps = {
  children?: ReactNode
  onClick?: () => void
  disabled?: boolean
  'aria-label'?: string
}

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
  listeners: new Set<(state: unknown) => void>(),
  states: [] as unknown[],
  stateIndex: 0,
  changed: false,
  effects: [] as Effect[],
  previousEffects: [] as Array<Effect & { cleanup?: () => void }>,
  buttons: [] as ButtonProps[],
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
  useMemo: (factory: () => unknown) => factory(),
}))

vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === harness.auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: Object.assign(() => harness.auth, {
    getState: () => harness.auth,
    subscribe: (listener: (state: unknown) => void) => {
      harness.listeners.add(listener)
      return () => harness.listeners.delete(listener)
    },
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'name' in opts ? `${key}:${String(opts.name)}` : key,
  }),
}))

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

vi.mock('@/components/ui/button', () => ({
  Button: (props: ButtonProps) => {
    harness.buttons.push(props)
    return <button disabled={props.disabled}>{props.children}</button>
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
      harness.buttons.push(props)
      return <button disabled={props.disabled}>{props.children}</button>
    },
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="alertdialog">{children}</div> : null,
  }
})

const opening = {
  role: { id: 'role-1', roleName: 'Role', roleKey: 'role', status: 1, dataScope: 'ALL' },
  openId: 'editor',
  principalEpoch: 4,
}

function renderTab() {
  let html: string
  let passes = 0
  do {
    harness.changed = false
    harness.stateIndex = 0
    harness.effects = []
    harness.buttons = []
    html = renderToStaticMarkup(<RoleMembersTab opening={opening} />)
    if (++passes > 12) throw new Error('Member tab did not settle')
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

function click(labelOrAria: string) {
  const button = harness.buttons.find(
    (item) =>
      item.children === labelOrAria ||
      (Array.isArray(item.children) && item.children.includes(labelOrAria)) ||
      item['aria-label'] === labelOrAria,
  )
  expect(button, labelOrAria).toBeDefined()
  expect(button!.disabled, labelOrAria).not.toBe(true)
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
})

describe('RoleMembersTab complete-baseline table', () => {
  it('never exposes editing from a cached baseline while its fresh read is pending', () => {
    harness.baselineFetching = true
    const html = renderTab()
    expect(html).toContain('roleMemberEdit.loading')
    expect(html).not.toContain('VisibleMember')
  })

  it('adds a candidate via Add dialog, removes a visible member, and preserves invisible baseline IDs', () => {
    renderTab()
    click('roleMemberEdit.candidates')
    renderTab()
    click('roleMemberEdit.addNamed:CandidatePrivateName')
    renderTab()
    click('authorization.done')
    renderTab()
    click('roleMemberEdit.removeNamed:VisibleMember')
    renderTab()
    click('roleMemberEdit.review')
    renderTab()
    click('roleMemberEdit.save')
    expect(harness.mutate).toHaveBeenCalledWith({
      baselineUserIds: ['visible', 'hidden-outside-scope'],
      userIds: ['hidden-outside-scope', 'candidate'],
    })
  })

  it('terminates loaded candidate profiles after revoke/regrant of system:user:list', () => {
    renderTab()
    click('roleMemberEdit.candidates')
    expect(renderTab()).toContain('CandidatePrivateName')
    expect(harness.mutationOptions?.requiredPerms).toContain('system:user:list')
    harness.auth.perms = ['system:role:list', 'system:role:edit']
    harness.listeners.forEach((listener) => listener(harness.auth))
    harness.auth.perms.push('system:user:list')
    harness.listeners.forEach((listener) => listener(harness.auth))
    const html = renderTab()
    expect(html).toContain('roleMemberEdit.denied')
    expect(html).not.toContain('CandidatePrivateName')
    expect(html).not.toContain('VisibleMember')
  })

  it('clears editable member and candidate state on 40300 write denial', () => {
    renderTab()
    click('roleMemberEdit.candidates')
    renderTab()
    harness.mutationOptions!.onDenied!.handle(new ApiError(40300, '全部数据范围不足'))
    const html = renderTab()
    expect(html).toContain('roleMemberEdit.denied')
    expect(html).not.toContain('CandidatePrivateName')
  })
})
