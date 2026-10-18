import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'
import type { RoleGraphMutationOptions } from './use-role-graph-mutation'
import type { RoleGraphSaveInput } from './role-graph.operations'
import type { RolePermissionTarget } from './role-permission.model'
import { RoleGraphCrudPanel, RoleGraphObjectActions } from './role-graph-crud'

const { auth, mutation, invalidate } = vi.hoisted(() => ({
  auth: {
    authorizationEpoch: 1,
    get allScopePerms() {
      return this.perms
    },
    perms: [] as string[],
  },
  mutation: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@/stores/auth', () => ({
  isAuthorizationCurrent: (epoch?: number) =>
    epoch === undefined || epoch === auth.authorizationEpoch,
  assertAuthorizationCurrent: () => undefined,
  useAuthStore: () => auth,
}))
vi.mock('./use-role-graph-mutation', () => ({ useRoleGraphMutation: mutation }))
vi.mock('./role-graph.operations', async (original) => ({
  ...(await original<typeof import('./role-graph.operations')>()),
  invalidateRoleGraphQueries: invalidate,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
  }),
}))

const role: RolePermissionTarget = {
  id: '9223372036854775801',
  roleName: '审计员',
  roleKey: 'audit',
  status: 1,
  sort: 47,
  remark: '保留原备注',
  dataScope: 'DEPT',
}

beforeEach(() => {
  auth.perms = []
  mutation.mockReset()
  mutation.mockReturnValue({ mutate: vi.fn(), isPending: false })
  invalidate.mockReset()
  invalidate.mockResolvedValue(undefined)
})

describe('role graph object context', () => {
  it('uses the existing independent write permissions for node actions', () => {
    const render = () =>
      renderToStaticMarkup(
        <RoleGraphObjectActions role={role} disabled={false} onCommand={vi.fn()} />,
      )
    expect(render()).not.toContain('<button')
    auth.perms = ['system:role:edit']
    expect(render()).toContain('编辑属性')
    expect(render()).toContain('停用角色')
    expect(render()).not.toContain('删除角色')
    auth.perms = ['system:role:remove']
    expect(render()).toContain('删除角色')
    expect(render()).not.toContain('编辑属性')
  })

  it('clears denied role data immediately and exits its editable context', () => {
    const client = new QueryClient()
    const targetKey = ['system', 'roles', role.id, 'menus']
    const otherKey = ['system', 'roles', 'another-role', 'menus']
    client.setQueryData(targetKey, ['sensitive-assignment'])
    client.setQueryData(otherKey, ['unrelated-assignment'])
    const denied = vi.fn()
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <RoleGraphCrudPanel
          command={{ id: 'editor', kind: 'edit', role }}
          onClose={vi.fn()}
          onCreated={vi.fn()}
          onUpdated={vi.fn()}
          onDeleted={vi.fn()}
          onDenied={denied}
          clearQueries={{ queryKey: ['system', 'roles', role.id] }}
        />
      </QueryClientProvider>,
    )
    const options = mutation.mock.calls[0][0] as RoleGraphMutationOptions<
      RoleGraphSaveInput | undefined,
      string | undefined
    >
    options.onDenied!.handle(new ApiError(403, '此角色已不可编辑'))
    expect(denied).toHaveBeenCalledOnce()
    expect(client.getQueryData(targetKey)).toBeUndefined()
    expect(client.getQueryData(otherKey)).toEqual(['unrelated-assignment'])
  })

  it('accepts the server id in navigation before invalidating queries that can refresh auth', () => {
    const client = new QueryClient()
    const created = vi.fn()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <RoleGraphCrudPanel
          command={{ id: 'draft', kind: 'create' }}
          onClose={vi.fn()}
          onCreated={created}
          onUpdated={vi.fn()}
          onDeleted={vi.fn()}
          onDenied={vi.fn()}
          clearQueries={{ queryKey: ['unused'] }}
        />
      </QueryClientProvider>,
    )
    expect(html).toContain('新角色草稿')
    expect(html).toContain('放弃编辑')
    expect(html).toContain('<form')
    const options = mutation.mock.calls[0][0] as RoleGraphMutationOptions<
      RoleGraphSaveInput | undefined,
      string | undefined
    >
    options.onSuccess!('9223372036854775999', { roleName: 'New', roleKey: 'new-role' })
    expect(created).toHaveBeenCalledWith('9223372036854775999', 'new-role')
    expect(created.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0])
  })
})
