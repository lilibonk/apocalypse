/**
 * 角色授权链（L2，读模式）：左侧持有成员、中间角色、右侧业务权限与导航入口同屏，悬停条目
 * 强调对应连线；编辑仍进入既有的三类关系编辑器。只读取现有角色关系接口，成员受 role:list 范围约束。
 */
import type { UseQueryResult } from '@tanstack/react-query'
import { KeyRound, LayoutList, ShieldCheck, Users } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FluidConduitOverlay, SketchBox, type ConduitLink } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

import { PrivateData } from './PrivateData'
import {
  canReadRoleWorkspace,
  type RawRoleMenu,
  type RolePermissionOpening,
} from './role-permission.model'
import './role-stage.css'

const LIMIT = 8

interface ChainData {
  members: PageResult<{
    id: string
    username: string
    nickname: string | null
    status: number | null
  }>
  grants: {
    permissionId: string
    enabled: boolean
    definition: { name: string; code: string } | null
  }[]
  navigation: { id: string; name: string | null }[]
  namesVisible: { permissions: boolean; navigation: boolean }
}

type Relation = 'permissions' | 'navigation' | 'members'

function flatten(nodes: readonly RawRoleMenu[]): RawRoleMenu[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

export function RoleAuthorizationChain({
  opening,
  onEdit,
  onCountsChange,
}: {
  opening: RolePermissionOpening
  onEdit: (relation: Relation, id: string, index: number) => void
  onCountsChange?: (counts: Record<Relation, number>) => void
}) {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const perms = useAuthStore((state) => state.perms)
  const canCatalog = perms.includes('system:permission:list')
  const canMenus = perms.includes('system:menu:list')
  const queryKey = ['system', 'roles', opening.role.id, 'chain', opening.openId] as const
  return (
    <PrivateData<ChainData>
      key={JSON.stringify([queryKey, opening.principalEpoch, authorizationEpoch])}
      queryKey={queryKey}
      canRead={canReadRoleWorkspace}
      load={async (transport) => {
        const id = opening.role.id
        const [members, permissions, navigation, tree] = await Promise.all([
          request<ChainData['members']>(`/system/roles/${id}/users`, {
            query: { page: 1, size: LIMIT },
            ...transport,
          }),
          request<{ grants: ChainData['grants'] }>(`/system/roles/${id}/permissions`, transport),
          request<{ navigationIds: string[] }>(`/system/roles/${id}/navigation`, transport),
          canMenus ? request<RawRoleMenu[]>('/system/menus/tree', transport) : Promise.resolve([]),
        ])
        const names = new Map(flatten(tree).map((node) => [String(node.id), node.menuName]))
        return {
          members,
          grants: permissions.grants,
          navigation: navigation.navigationIds.map((navigationId) => ({
            id: navigationId,
            name: names.get(navigationId) ?? null,
          })),
          namesVisible: { permissions: canCatalog, navigation: canMenus },
        }
      }}
    >
      {(query) => (
        <ChainBody
          query={query}
          opening={opening}
          onEdit={onEdit}
          onCountsChange={onCountsChange}
        />
      )}
    </PrivateData>
  )
}

function ChainBody({
  query,
  opening,
  onEdit,
  onCountsChange,
}: {
  query: UseQueryResult<ChainData>
  opening: RolePermissionOpening
  onEdit: (relation: Relation, id: string, index: number) => void
  onCountsChange?: (counts: Record<Relation, number>) => void
}) {
  const { t } = useTranslation('system')
  const stageRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (query.data && !query.isError)
      onCountsChange?.({
        permissions: query.data.grants.length,
        navigation: query.data.navigation.length,
        members: query.data.members.total,
      })
  }, [query.data, query.isError, onCountsChange])

  const data = query.data
  const left = useMemo(
    () =>
      (data?.members.list ?? []).slice(0, LIMIT).map((member) => ({
        key: `member-${member.id}`,
        id: member.id,
        relation: 'members' as const,
        label: member.nickname || member.username,
        detail: member.username,
      })),
    [data?.members.list],
  )
  const permissionItems = useMemo(
    () =>
      (data?.grants ?? []).slice(0, LIMIT / 2).map((grant) => ({
        key: `permission-${grant.permissionId}`,
        id: grant.permissionId,
        relation: 'permissions' as const,
        label: grant.definition?.name ?? t('panorama.chainPermissions'),
        detail: `${grant.definition?.code ?? grant.permissionId}${grant.enabled ? '' : ` · ${t('panorama.grantPaused')}`}`,
      })),
    [data?.grants, t],
  )
  const navigationItems = useMemo(
    () =>
      (data?.navigation ?? []).slice(0, LIMIT / 2).map((item) => ({
        key: `navigation-${item.id}`,
        id: item.id,
        relation: 'navigation' as const,
        label: item.name ?? `#${item.id}`,
        detail: t('panorama.chainNavigation'),
      })),
    [data?.navigation, t],
  )
  const right = useMemo(
    () => [...permissionItems, ...navigationItems],
    [navigationItems, permissionItems],
  )

  const conduitLinks = useMemo<ConduitLink[]>(
    () => [
      ...left.map((item) => ({
        id: `chain-link-${item.key}`,
        from: `chain-node-${item.key}`,
        to: 'chain-role-hub',
        enabled: hovered === null || hovered === item.key,
        scope: (hovered === item.key ? 'ALL' : 'STANDARD') as 'ALL' | 'STANDARD',
      })),
      ...right.map((item) => ({
        id: `chain-link-${item.key}`,
        from: 'chain-role-hub',
        to: `chain-node-${item.key}`,
        enabled: hovered === null || hovered === item.key,
        scope: (hovered === item.key ? 'ALL' : 'STANDARD') as 'ALL' | 'STANDARD',
      })),
    ],
    [hovered, left, right],
  )

  if (query.isPending)
    return (
      <div role="status" aria-label={t('panorama.chainLoading')}>
        <Skeleton className="role-topology-canvas h-72 w-full rounded-2xl" />
      </div>
    )
  if (query.isError)
    return (
      <div role="alert" className="rounded-2xl border bg-card p-5 text-sm">
        <p>{query.error instanceof ApiError ? query.error.message : t('panorama.chainFailed')}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void query.refetch()}>
          {t('panorama.retry')}
        </Button>
      </div>
    )
  if (!data) return null

  return (
    <div className="space-y-4">
      <div
        ref={stageRef}
        role="group"
        aria-label={t('panorama.chainTitle', { name: opening.role.roleName })}
        className="relative overflow-hidden rounded-panel border border-border-subtle bg-card/70 p-4 sm:p-5"
      >
        <FluidConduitOverlay
          containerRef={stageRef}
          links={conduitLinks}
          flow="horizontal"
          pulseKey={hovered ?? 'idle'}
          minContainerWidth={560}
        />

        <div className="relative z-[2] grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,1fr)] md:gap-11">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('panorama.chainMembers')} ({data.members.total})
            </p>
            {left.length === 0 ? (
              <p className="rounded-control border border-dashed border-border-subtle p-3 text-xs text-muted-foreground">
                {t('panorama.chainMembersHidden')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {left.map((item, index) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      data-conduit-anchor={`chain-node-${item.key}`}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-panel border border-border-subtle bg-card/90 px-3 py-2 text-left transition-colors hover:border-brand-text/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        hovered === item.key && 'border-brand-text/60 bg-primary/8',
                      )}
                      aria-label={t('roleManage.openRelationObject', {
                        relation: t(`authorization.${item.relation}`),
                        name: item.label,
                      })}
                      onClick={() => onEdit(item.relation, item.id, index)}
                      onMouseEnter={() => setHovered(item.key)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(item.key)}
                      onBlur={() => setHovered(null)}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/14 text-xs font-semibold text-brand-text">
                        {item.label.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          @{item.detail}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-center">
            <SketchBox
              seed={41}
              wash="normal"
              data-conduit-anchor="chain-role-hub"
              className="w-full p-4 text-center"
            >
              <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-border-subtle bg-primary/15 text-brand-text">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <p className="truncate text-sm font-semibold">{opening.role.roleName}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                @{opening.role.roleKey}
              </p>
            </SketchBox>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('panorama.chainPermissions')} & {t('panorama.chainNavigation')}
            </p>
            {right.length === 0 ? (
              <p className="rounded-control border border-dashed border-border-subtle p-3 text-xs text-muted-foreground">
                {t('panorama.chainPermissionsHidden')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {right.map((item, index) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      data-conduit-anchor={`chain-node-${item.key}`}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-panel border border-border-subtle bg-card/90 px-3 py-2 text-left transition-colors hover:border-brand-text/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        hovered === item.key && 'border-brand-text/60 bg-primary/8',
                      )}
                      aria-label={t('roleManage.openRelationObject', {
                        relation: t(`authorization.${item.relation}`),
                        name: item.label,
                      })}
                      onClick={() => onEdit(item.relation, item.id, index)}
                      onMouseEnter={() => setHovered(item.key)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(item.key)}
                      onBlur={() => setHovered(null)}
                    >
                      {item.relation === 'permissions' ? (
                        <KeyRound className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
                      ) : (
                        <LayoutList
                          className="size-4 shrink-0 text-brand-text"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" />
          {t('panorama.chainMembersHidden')}
          {data.members.total > left.length &&
            ` · ${t('panorama.chainMore', { count: data.members.total - left.length })}`}
        </span>
        {(!data.namesVisible.permissions || data.grants.length > permissionItems.length) && (
          <span className="inline-flex items-center gap-1">
            <KeyRound className="size-3.5" aria-hidden="true" />
            {!data.namesVisible.permissions && t('panorama.chainPermissionsHidden')}
            {!data.namesVisible.permissions && data.grants.length > permissionItems.length && ' · '}
            {data.grants.length > permissionItems.length &&
              t('panorama.chainMore', { count: data.grants.length - permissionItems.length })}
          </span>
        )}
        {(!data.namesVisible.navigation || data.navigation.length > navigationItems.length) && (
          <span className="inline-flex items-center gap-1">
            <LayoutList className="size-3.5" aria-hidden="true" />
            {!data.namesVisible.navigation && t('panorama.chainNavigationHidden')}
            {!data.namesVisible.navigation &&
              data.navigation.length > navigationItems.length &&
              ' · '}
            {data.navigation.length > navigationItems.length &&
              t('panorama.chainMore', { count: data.navigation.length - navigationItems.length })}
          </span>
        )}
      </div>
    </div>
  )
}
