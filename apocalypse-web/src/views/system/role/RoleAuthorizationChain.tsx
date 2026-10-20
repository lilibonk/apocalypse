/**
 * 角色授权链（L2，读模式）：左侧持有成员、中间角色、右侧业务权限与导航入口同屏，悬停条目
 * 强调对应连线；编辑仍进入既有的三类关系编辑器。只读取现有角色关系接口，成员受 role:list 范围约束。
 */
import type { UseQueryResult } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { KeyRound, LayoutList, ShieldCheck, Users } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { insightMotion } from '@/design/motion'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError, request } from '@/lib/api/client'
import type { PageResult } from '@/lib/api/types'
import { useAuthStore } from '@/stores/auth'

import { PrivateData } from './PrivateData'
import {
  canReadRoleWorkspace,
  type RawRoleMenu,
  type RolePermissionOpening,
} from './role-permission.model'
import './role-panorama.css'

const LIMIT = 8
const VIEW = { width: 820, height: 440 }
const CENTER = { x: 410, y: 220 }
const RIGHT_X = 590
const LEFT_X = 230

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

function ChainEdge({ d, related }: { d: string; related: boolean }) {
  const enabled = useMotionPreference()
  const target = { d, pathLength: 1 }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.path
      className="role-panorama-edge"
      data-related={related || undefined}
      initial={enabled ? { ...target, pathLength: 0 } : target}
      animate={controls}
    />
  )
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
  const [hovered, setHovered] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (query.data && !query.isError)
      onCountsChange?.({
        permissions: query.data.grants.length,
        navigation: query.data.navigation.length,
        members: query.data.members.total,
      })
  }, [query.data, query.isError, onCountsChange])
  if (query.isPending)
    return (
      <div role="status" aria-label={t('panorama.chainLoading')}>
        <Skeleton className="role-panorama-canvas h-auto w-full rounded-2xl" />
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
  const data = query.data
  const left = data.members.list.slice(0, LIMIT).map((member) => ({
    key: `member-${member.id}`,
    id: member.id,
    relation: 'members' as const,
    label: member.nickname || member.username,
    detail: member.username,
  }))
  const permissionItems = data.grants.slice(0, LIMIT / 2).map((grant) => ({
    key: `permission-${grant.permissionId}`,
    id: grant.permissionId,
    relation: 'permissions' as const,
    label: grant.definition?.name ?? t('panorama.chainPermissions'),
    detail: `${grant.definition?.code ?? grant.permissionId}${grant.enabled ? '' : ` · ${t('panorama.grantPaused')}`}`,
  }))
  const navigationItems = data.navigation.slice(0, LIMIT / 2).map((item) => ({
    key: `navigation-${item.id}`,
    id: item.id,
    relation: 'navigation' as const,
    label: item.name ?? `#${item.id}`,
    detail: t('panorama.chainNavigation'),
  }))
  const right = [...permissionItems, ...navigationItems]
  const y = (index: number, count: number) =>
    count <= 1 ? CENTER.y : 50 + (index * (VIEW.height - 100)) / (count - 1)
  const curve = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const middle = (from.x + to.x) / 2
    return `M ${from.x} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`
  }
  return (
    <div className="space-y-4">
      <div
        className="role-panorama-canvas relative overflow-hidden rounded-panel border border-border-subtle bg-card"
        style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }}
        role="group"
        aria-label={t('panorama.chainTitle', { name: opening.role.roleName })}
      >
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {left.map((item, index) => (
            <ChainEdge
              key={item.key}
              related={hovered === item.key}
              d={curve({ x: LEFT_X, y: y(index, left.length) }, CENTER)}
            />
          ))}
          {right.map((item, index) => (
            <ChainEdge
              key={item.key}
              related={hovered === item.key}
              d={curve(CENTER, { x: RIGHT_X, y: y(index, right.length) })}
            />
          ))}
        </svg>
        <div
          className="role-panorama-dial"
          data-open
          style={{ left: '50%', top: '50%', width: `${(104 / VIEW.width) * 100}%` }}
        >
          <ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[90%] truncate text-sm font-semibold">
            {opening.role.roleName}
          </span>
        </div>
        {[
          {
            items: left,
            x: LEFT_X,
            icon: Users,
            title: t('panorama.chainMembers'),
            empty: data.members.total === 0,
          },
          {
            items: right,
            x: RIGHT_X,
            icon: KeyRound,
            title: t('panorama.chainPermissions'),
            empty: right.length === 0,
          },
        ].map((column) =>
          column.items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className="role-panorama-item text-left"
              style={{
                // Left pills end at the edge origin; right pills start at the edge end.
                left: `${(column.x / VIEW.width) * 100 - (column.x < CENTER.x ? 26 : 0)}%`,
                top: `${(y(index, column.items.length) / VIEW.height) * 100}%`,
                width: '26%',
              }}
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
              <span className="block truncate text-sm font-medium">{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
            </button>
          )),
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" />
          {t('panorama.chainMembersHidden')}
          {data.members.total > left.length &&
            ` · ${t('panorama.chainMore', { count: data.members.total - left.length })}`}
        </span>
        <span className="inline-flex items-center gap-1">
          <KeyRound className="size-3.5" aria-hidden="true" />
          {!data.namesVisible.permissions && t('panorama.chainPermissionsHidden')}
          {data.grants.length > permissionItems.length &&
            t('panorama.chainMore', { count: data.grants.length - permissionItems.length })}
        </span>
        <span className="inline-flex items-center gap-1">
          <LayoutList className="size-3.5" aria-hidden="true" />
          {!data.namesVisible.navigation && t('panorama.chainNavigationHidden')}
          {data.navigation.length > navigationItems.length &&
            t('panorama.chainMore', { count: data.navigation.length - navigationItems.length })}
        </span>
      </div>
    </div>
  )
}
