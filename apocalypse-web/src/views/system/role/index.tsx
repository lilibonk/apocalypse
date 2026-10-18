/** Role workbench escapes DynaLayer for related navigation, permission grants and members.
 * Standard role CRUD remains schema based; list and graph consume identical guarded editors. */
import { List, Network } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

import { DynaPage } from '@/components/dyna'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import schema from './role.schema'
import { localizeRoleSchema, RoleForm } from './RoleForm'
import { RolePermissionWorkspace } from './RolePermissionWorkspace'
import { RolePermissionEditor } from './RolePermissionEditor'
import { RoleMemberEditor } from './RoleMemberEditor'
import { RoleBusinessPermissions } from './RoleBusinessPermissions'
import { RoleGraphCrudPanel } from './role-graph-crud'
import { invalidateRoleGraphQueries } from './role-graph.operations'
import {
  canReadRoleWorkspace,
  type RolePermissionOpening,
  type RolePermissionTarget,
} from './role-permission.model'
import type { RoleGraphCommand } from './role-graph-crud.model'

type Row = Record<string, unknown>
function targetOf(row: Row): RolePermissionTarget {
  return {
    id: String(row.id ?? ''),
    roleName: String(row.roleName ?? ''),
    roleKey: String(row.roleKey ?? ''),
    status: typeof row.status === 'number' ? row.status : null,
    dataScope: typeof row.dataScope === 'string' ? row.dataScope : null,
    ...(typeof row.authorizationRevision === 'string'
      ? { authorizationRevision: row.authorizationRevision }
      : {}),
    ...(Object.hasOwn(row, 'sort') ? { sort: typeof row.sort === 'number' ? row.sort : null } : {}),
    ...(Object.hasOwn(row, 'remark')
      ? { remark: typeof row.remark === 'string' ? row.remark : null }
      : {}),
  }
}
function RelationshipDialog({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation('system')
  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-6xl"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('authorization.dialogHint')}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Full assignment baseline is read by the shared editor, including profiles outside the readable scope. */
export function GrantUsersDialog({
  role,
  onClose,
}: {
  role: { id: string; roleName: string }
  onClose: () => void
}) {
  const { t } = useTranslation('system')
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const [opening] = useState<RolePermissionOpening>(() => ({
    role: targetOf(role),
    principalEpoch: epoch,
    openId: crypto.randomUUID(),
  }))
  return (
    <RelationshipDialog title={t('authorization.members')}>
      <RoleMemberEditor
        opening={opening}
        presentation="list"
        onClose={onClose}
        onSaved={onClose}
        onResourceDenied={onClose}
      />
    </RelationshipDialog>
  )
}

export default function RolePage() {
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <RolePageContent key={authorizationEpoch} />
}
function RolePageContent() {
  const { t } = useTranslation('system')
  const auth = useAuthStore()
  const client = useQueryClient()
  const desktop = useDesktopViewport()
  const canInspectGraph = desktop && canReadRoleWorkspace(auth)
  const localizedSchema = useMemo(() => localizeRoleSchema(schema, t), [t])
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('roleView') === 'list' ? 'list' : 'graph'
  const setView = useCallback(
    (nextView: 'graph' | 'list') =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.set('roleView', nextView)
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  const [graphBusy, setGraphBusy] = useState(false)
  const [relation, setRelation] = useState<{
    kind: 'permissions' | 'navigation' | 'members'
    opening: RolePermissionOpening
  } | null>(null)
  const [command, setCommand] = useState<RoleGraphCommand | null>(null)
  useLayoutEffect(
    () =>
      useAuthStore.subscribe((current) => {
        if (current.meLoaded && !canReadRoleWorkspace(current)) setView('list')
      }),
    [setView],
  )
  const customActions = useMemo(() => {
    const open = (kind: 'permissions' | 'navigation' | 'members', row: Row) =>
      setRelation({
        kind,
        opening: {
          role: targetOf(row),
          principalEpoch: auth.sessionEpoch,
          openId: crypto.randomUUID(),
        },
      })
    return {
      'grant-permissions': (row: Row) => open('permissions', row),
      'grant-navigation': (row: Row) => open('navigation', row),
      'grant-users': (row: Row) => open('members', row),
      'toggle-role': (row: Row) =>
        setCommand({ id: crypto.randomUUID(), kind: 'toggle', role: targetOf(row) }),
    }
  }, [auth.sessionEpoch])
  const closeRelation = () => setRelation(null)
  const saved = () => {
    void invalidateRoleGraphQueries(client, relation?.opening.role.id)
    closeRelation()
  }
  const viewControl = canInspectGraph ? (
    <div
      className="role-permission-view flex rounded-xl p-1"
      role="group"
      aria-label={t('roleGraph.pageView')}
    >
      {(['graph', 'list'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium"
          aria-pressed={view === kind}
          disabled={graphBusy}
          onClick={() => setView(kind)}
        >
          {kind === 'graph' ? (
            <Network aria-hidden className="size-4" />
          ) : (
            <List aria-hidden className="size-4" />
          )}
          {t(kind === 'graph' ? 'roleGraph.action' : 'roleGraph.roleList')}
        </button>
      ))}
    </div>
  ) : null
  return (
    <>
      {canReadRoleWorkspace(auth) && view === 'graph' && (desktop || graphBusy) ? (
        <RolePermissionWorkspace
          principalEpoch={auth.sessionEpoch}
          presentation={desktop ? 'graph' : 'list'}
          viewControl={viewControl}
          onBusyChange={setGraphBusy}
        />
      ) : (
        <>
          {viewControl && <div className="flex justify-end px-4 pt-4 sm:px-6">{viewControl}</div>}
          <DynaPage
            schema={localizedSchema}
            customActions={customActions}
            formComponent={RoleForm}
          />
        </>
      )}
      {relation && (
        <RelationshipDialog title={t(`authorization.${relation.kind}`)}>
          {relation.kind === 'permissions' ? (
            <RoleBusinessPermissions
              opening={relation.opening}
              presentation="list"
              onEditingChange={setGraphBusy}
              onClose={closeRelation}
            />
          ) : relation.kind === 'navigation' ? (
            <RolePermissionEditor
              opening={relation.opening}
              presentation="list"
              onClose={closeRelation}
              onSaved={saved}
              onResourceDenied={closeRelation}
            />
          ) : (
            <RoleMemberEditor
              opening={relation.opening}
              presentation="list"
              onClose={closeRelation}
              onSaved={saved}
              onResourceDenied={closeRelation}
            />
          )}
        </RelationshipDialog>
      )}
      {command && (
        <RelationshipDialog title={t('authorization.toggleRole')}>
          <RoleGraphCrudPanel
            command={command}
            onClose={() => setCommand(null)}
            onCreated={() => setCommand(null)}
            onUpdated={() => setCommand(null)}
            onDeleted={() => setCommand(null)}
            onDenied={() => setCommand(null)}
            clearQueries={{ queryKey: ['system', 'roles'] }}
          />
        </RelationshipDialog>
      )}
    </>
  )
}
