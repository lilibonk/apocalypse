import { useLayoutEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pencil, RefreshCw, Users } from 'lucide-react'

import { InsightCard } from '@/components/insights/InsightCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { isResourceDenied, useResourceDenial } from '@/lib/query/use-resource-denial'
import { useAuthStore } from '@/stores/auth'

import { RoleGraphPagination } from './RolePermissionGraph'
import { canReadRoleWorkspace, type RolePermissionOpening } from './role-permission.model'
import { createRoleMembersQuery, ROLE_MEMBERS_PAGE_SIZE } from './role-permission.queries'
import { RoleMemberGraph } from './RoleMemberGraph'
import { RoleMemberEditor } from './RoleMemberEditor'
import { validRoleMemberPage } from './role-member-draft.model'
import './role-permission.css'
import './role-member-relations.css'

export function RoleMemberRelations({
  opening,
  presentation = 'graph',
  onClose,
  onEditingChange,
}: {
  opening: RolePermissionOpening
  presentation?: 'graph' | 'list'
  onClose: () => void
  onEditingChange: (editing: boolean) => void
}) {
  const { t } = useTranslation('system')
  const auth = useAuthStore()
  const [editorId, setEditorId] = useState<string | null>(null)
  const [readGeneration, setReadGeneration] = useState(0)
  const [editorDenied, setEditorDenied] = useState(false)
  useLayoutEffect(() => {
    onEditingChange(editorId !== null)
    return () => onEditingChange(false)
  }, [editorId, onEditingChange])
  const readOpening = { ...opening, openId: `${opening.openId}:members:${readGeneration}` }
  const returnToRead = () => {
    setEditorId(null)
    setReadGeneration((value) => value + 1)
  }
  if (!canReadRoleWorkspace(auth) || auth.sessionEpoch !== opening.principalEpoch) return null
  if (editorId)
    return (
      <RoleMemberEditor
        key={editorId}
        opening={{ ...opening, openId: editorId }}
        presentation={presentation}
        onClose={returnToRead}
        onSaved={returnToRead}
        onResourceDenied={() => {
          setEditorDenied(true)
          returnToRead()
        }}
      />
    )
  return (
    <>
      {editorDenied && (
        <p className="rounded-xl border border-warning bg-card p-4 text-sm" role="alert">
          {t('roleMemberEdit.readonlyAfterDenied')}
        </p>
      )}
      <RoleMemberContent
        key={readOpening.openId}
        opening={readOpening}
        onClose={onClose}
        onEdit={
          auth.allScopePerms.includes('system:role:edit')
            ? () => {
                const current = useAuthStore.getState()
                if (
                  !canReadRoleWorkspace(current) ||
                  current.sessionEpoch !== opening.principalEpoch ||
                  !current.allScopePerms.includes('system:role:edit')
                )
                  return
                setEditorDenied(false)
                setEditorId(crypto.randomUUID())
              }
            : undefined
        }
      />
    </>
  )
}

function RoleMemberContent({
  opening,
  onClose,
  onEdit,
}: {
  opening: RolePermissionOpening
  onClose: () => void
  onEdit?: () => void
}) {
  const { t } = useTranslation('system')
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const roleId = opening.role.id
  const openId = opening.openId
  const principalEpoch = opening.principalEpoch
  const resource = useMemo(
    () => createRoleMembersQuery({ role: { id: roleId }, openId, principalEpoch }, page),
    [openId, principalEpoch, roleId, page],
  )
  const result = useQuery(resource.options)
  const denied = isResourceDenied(result.error)
  useResourceDenial({
    errors: [result.error],
    clear: resource.filter,
    reset: () => setSelectedId(null),
  })
  useLayoutEffect(() => {
    resource.activate()
    return () => {
      resource.deactivate()
      queueMicrotask(() => {
        if (!resource.disposeIfInactive()) return
        void client.cancelQueries(resource.filter, { revert: false })
        client.removeQueries(resource.filter)
      })
    }
  }, [client, resource])
  const data = denied ? undefined : result.data
  if (data && page !== validRoleMemberPage(page, data.total, ROLE_MEMBERS_PAGE_SIZE)) {
    setPage(validRoleMemberPage(page, data.total, ROLE_MEMBERS_PAGE_SIZE))
    setSelectedId(null)
  }
  const selected = data?.list.find((member) => member.id === selectedId)
  return (
    <section
      className="role-member-workspace min-w-0 space-y-4"
      aria-label={t('roleMembers.title', { defaultValue: '成员关系' })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('roleMembers.back', { defaultValue: '返回角色关系' })}
          >
            <ArrowLeft />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">
              {t('roleMembers.title', { defaultValue: '成员关系' })}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{opening.role.roleName}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onEdit && !denied && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="size-4" />
              {t('roleMemberEdit.edit')}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={result.isFetching}
            onClick={() => void result.refetch()}
          >
            <RefreshCw className="size-4" />
            {t('roleMembers.refresh', { defaultValue: '刷新成员' })}
          </Button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('roleMembers.scope', {
          defaultValue: '按当前访问范围展示关联成员；可见人数不代表此角色的全部成员。',
        })}
      </p>
      {result.isError && (
        <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
          <p>
            {result.error instanceof ApiError
              ? result.error.message
              : t('roleMembers.failed', { defaultValue: '成员关系加载失败' })}
          </p>
          {data && (
            <p className="mt-1 text-xs text-muted-foreground">{t('roleGraph.refreshFailed')}</p>
          )}
        </div>
      )}
      {result.isPending && <Skeleton className="h-80 w-full rounded-panel" />}
      {data && (
        <div className="role-member-layout">
          <InsightCard className="overflow-hidden p-4">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <Users className="size-4" />
                {t('roleMembers.visibleCount', {
                  count: data.total,
                  defaultValue: '当前可见 {{count}} 名成员',
                })}
              </span>
              <span>{t('roleMembers.relationship', { defaultValue: '成员 → 角色' })}</span>
            </div>
            {data.list.length === 0 ? (
              <p role="status" className="py-16 text-center text-sm text-muted-foreground">
                {t('roleMembers.empty', { defaultValue: '当前访问范围内没有可见成员' })}
              </p>
            ) : (
              <RoleMemberGraph
                roleName={opening.role.roleName}
                nodes={data.list.map((member) => ({ id: member.id, member }))}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
            <RoleGraphPagination
              page={page - 1}
              pages={Math.max(1, Math.ceil(data.total / ROLE_MEMBERS_PAGE_SIZE))}
              onPage={(next) => {
                setSelectedId(null)
                setPage(next + 1)
              }}
            />
          </InsightCard>
          <InsightCard className="p-5">
            <h3 className="text-sm font-semibold">
              {t('roleMembers.details', { defaultValue: '成员详情' })}
            </h3>
            {selected ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('roleMembers.username', { defaultValue: '用户名' })}
                  </dt>
                  <dd className="mt-1 break-words">{selected.username}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('roleMembers.nickname', { defaultValue: '显示名称' })}
                  </dt>
                  <dd className="mt-1 break-words">{selected.nickname || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('roleMembers.status', { defaultValue: '用户状态' })}
                  </dt>
                  <dd className="mt-1">
                    {t(
                      selected.status === 1
                        ? 'roleGraph.enabled'
                        : selected.status === 0
                          ? 'roleGraph.disabled'
                          : 'roleGraph.unknown',
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t('roleMembers.choose', { defaultValue: '选择成员节点查看信息' })}
              </p>
            )}
          </InsightCard>
        </div>
      )}
    </section>
  )
}
