import { queryOptions } from '@tanstack/react-query'
import { CanceledError } from 'axios'

import { captureRequestContext, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { isAuthorizationCurrent, useAuthStore } from '@/stores/auth'

import {
  buildRolePermissionModel,
  canReadRolePermissionGraph,
  canReadRoleWorkspace,
  canManageRoleRelations,
  type RawRoleMenu,
  type RolePermissionOpening,
  type RolePermissionTarget,
} from './role-permission.model'

type RoleResourceOpening = Pick<RolePermissionOpening, 'openId' | 'principalEpoch'> & {
  role: Pick<RolePermissionTarget, 'id'>
}

/** One private opening owns both inputs. Partial endpoint results are never published. */
export function createRolePermissionQuery(opening: RoleResourceOpening) {
  const queryKey = [
    'system',
    'roles',
    opening.role.id,
    'menus',
    'permission-graph',
    opening.principalEpoch,
    opening.openId,
  ] as const
  return privateRoleGraphQuery(
    queryKey,
    opening.principalEpoch,
    canReadRolePermissionGraph,
    async (transport) => {
      const [tree, navigation] = await Promise.all([
        request<RawRoleMenu[]>('/system/menus/tree', transport),
        request<RoleNavigationBaseline>(`/system/roles/${opening.role.id}/navigation`, transport),
      ])
      return buildRolePermissionModel(navigationTree(tree), navigation.navigationIds)
    },
  )
}

export interface RoleMenuDraftSource {
  tree: RawRoleMenu[]
  /** The replacement baseline includes unresolved IDs. Never derive it from projected nodes. */
  menuIds: string[]
  revision: string
}

export interface RoleNavigationBaseline {
  roleId: string
  revision: string
  navigationIds: string[]
}

/** Retired button definitions are compatibility records, never navigation candidates. */
function navigationTree(tree: readonly RawRoleMenu[]): RawRoleMenu[] {
  return tree
    .filter((node) => (node.menuType ?? node.type) !== 'F')
    .map((node) => ({
      ...node,
      perms: null,
      children: navigationTree(node.children ?? []),
    }))
}

export function createRoleMenuDraftQuery(opening: RoleResourceOpening) {
  const queryKey = [
    'system',
    'roles',
    opening.role.id,
    'menus',
    'permission-draft',
    opening.principalEpoch,
    opening.openId,
  ] as const
  return privateRoleGraphQuery(
    queryKey,
    opening.principalEpoch,
    canReadRolePermissionGraph,
    async (transport): Promise<RoleMenuDraftSource> => {
      const [tree, navigation] = await Promise.all([
        request<RawRoleMenu[]>('/system/menus/tree', transport),
        request<RoleNavigationBaseline>(`/system/roles/${opening.role.id}/navigation`, transport),
      ])
      return {
        tree: navigationTree(tree),
        menuIds: navigation.navigationIds,
        revision: navigation.revision,
      }
    },
  )
}

export const ROLE_CHOICES_PAGE_SIZE = 4
export const ROLE_MEMBERS_PAGE_SIZE = 4

export interface RoleGraphMember {
  id: string
  username: string
  nickname: string | null
  status: number | null
}

const canEditRoleMembers = canManageRoleRelations

/** Only this endpoint is a complete replacement baseline; ordinary member pages are scoped. */
export function createRoleMemberDraftQuery(opening: RoleResourceOpening) {
  const queryKey = [
    'system',
    'roles',
    opening.role.id,
    'users',
    'member-draft',
    opening.principalEpoch,
    opening.openId,
  ] as const
  return privateRoleGraphQuery(queryKey, opening.principalEpoch, canEditRoleMembers, (transport) =>
    request<string[]>(`/system/roles/${opening.role.id}/user-ids`, transport),
  )
}

export function createRoleMemberCandidatesQuery(
  opening: RoleResourceOpening,
  params: { page: number; keyword: string },
) {
  const queryKey = [
    'system',
    'roles',
    opening.role.id,
    'users',
    'member-candidates',
    opening.principalEpoch,
    opening.openId,
    { ...params, size: ROLE_MEMBERS_PAGE_SIZE },
  ] as const
  return privateRoleGraphQuery(
    queryKey,
    opening.principalEpoch,
    (auth) => canEditRoleMembers(auth) && auth.perms.includes('system:user:list'),
    (transport) =>
      request<PageResult<RoleGraphMember>>('/system/users/page', {
        ...transport,
        query: {
          page: params.page,
          size: ROLE_MEMBERS_PAGE_SIZE,
          keyword: params.keyword || undefined,
        },
      }),
  )
}

/** The server returns members within role:list scope, not a global replacement baseline. */
export function createRoleMembersQuery(opening: RoleResourceOpening, page: number) {
  const queryKey = [
    'system',
    'roles',
    opening.role.id,
    'users',
    'permission-graph-members',
    opening.principalEpoch,
    opening.openId,
    { page, size: ROLE_MEMBERS_PAGE_SIZE },
  ] as const
  return privateRoleGraphQuery(
    queryKey,
    opening.principalEpoch,
    canReadRoleWorkspace,
    (transport) =>
      request<PageResult<RoleGraphMember>>(`/system/roles/${opening.role.id}/users`, {
        ...transport,
        query: { page, size: ROLE_MEMBERS_PAGE_SIZE },
      }),
  )
}

export function createRoleChoicesQuery(params: {
  page: number
  keyword: string
  principalEpoch: number
  openId: string
}) {
  const queryKey = [
    'system',
    'roles',
    'permission-graph-choices',
    params.principalEpoch,
    params.openId,
    { page: params.page, size: ROLE_CHOICES_PAGE_SIZE, keyword: params.keyword },
  ] as const
  return privateRoleGraphQuery(queryKey, params.principalEpoch, canReadRoleWorkspace, (transport) =>
    request<PageResult<RolePermissionTarget>>('/system/roles/page', {
      ...transport,
      query: {
        page: params.page,
        size: ROLE_CHOICES_PAGE_SIZE,
        keyword: params.keyword || undefined,
      },
    }),
  )
}

/** Local ownership for read-only role graph resources; this is not a capability registry. */
export function privateRoleGraphQuery<Data>(
  queryKey: readonly unknown[],
  principalEpoch: number,
  canRead: (auth: ReturnType<typeof useAuthStore.getState>) => boolean,
  load: (transport: {
    signal: AbortSignal
    context: ReturnType<typeof captureRequestContext>
  }) => Promise<Data>,
) {
  let active = true
  let generation = 0
  const authorizationEpoch = useAuthStore.getState().authorizationEpoch
  const assertCurrent = (capturedGeneration: number) => {
    const auth = useAuthStore.getState()
    if (
      !active ||
      capturedGeneration !== generation ||
      auth.sessionEpoch !== principalEpoch ||
      !isAuthorizationCurrent(authorizationEpoch) ||
      !canRead(auth)
    )
      throw new CanceledError('Role graph context changed')
  }

  return {
    options: queryOptions({
      queryKey: [...queryKey, { authorizationEpoch }],
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
      queryFn: async ({ signal }) => {
        const capturedGeneration = generation
        assertCurrent(capturedGeneration)
        const controller = new AbortController()
        const cancel = () => controller.abort()
        signal.addEventListener('abort', cancel, { once: true })
        if (signal.aborted) controller.abort()
        let accessRevoked = false
        const unsubscribe = useAuthStore.subscribe((auth) => {
          if (
            auth.sessionEpoch !== principalEpoch ||
            !isAuthorizationCurrent(authorizationEpoch) ||
            !canRead(auth)
          ) {
            accessRevoked = true
            controller.abort()
          }
        })
        const principal = captureRequestContext()
        const context = {
          ...principal,
          assertCurrent: () => {
            principal.assertCurrent()
            assertCurrent(capturedGeneration)
            if (accessRevoked || controller.signal.aborted)
              throw new CanceledError('Role graph access revoked')
          },
        }
        try {
          const data = await load({ signal: controller.signal, context })
          context.assertCurrent()
          if (controller.signal.aborted) throw new CanceledError()
          return data
        } catch (error) {
          controller.abort()
          throw error
        } finally {
          unsubscribe()
          signal.removeEventListener('abort', cancel)
        }
      },
    }),
    filter: { queryKey: [...queryKey, { authorizationEpoch }], exact: true },
    activate: () => {
      active = true
    },
    deactivate: () => {
      active = false
    },
    // StrictMode reactivates in the same call stack. A real close stays inactive.
    disposeIfInactive: () => {
      if (active) return false
      generation++
      return true
    },
  }
}
