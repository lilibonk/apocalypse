import { useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, KeyRound, ShieldCheck } from 'lucide-react'

import { FluidConduitOverlay, SketchBox, type ConduitLink } from '@/components/motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  ROLE_GRAPH_BRANCH_SIZE,
  rolePermissionPage,
  type RolePermissionModel,
  type RolePermissionTarget,
} from './role-permission.model'
import { permissionNodeIcons } from './role-permission.icons'

export function RoleGraphPagination({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  const { t } = useTranslation('system')
  if (pages < 2) return null
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('roleGraph.previous')}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="tabular-nums">{t('roleGraph.page', { page: page + 1, pages })}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('roleGraph.next')}
        disabled={page + 1 >= pages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

/** A bounded neighborhood of the real hierarchy. Pagination never discards the remaining nodes. */
export function RolePermissionGraph({
  model,
  role,
  selectedId,
  onSelect,
  branchPage,
  onBranchPage,
}: {
  model: RolePermissionModel
  role: RolePermissionTarget
  selectedId: string | null
  onSelect: (id: string | null) => void
  branchPage: number
  onBranchPage: (page: number) => void
}) {
  const { t } = useTranslation('system')
  const stageRef = useRef<HTMLDivElement>(null)
  const centerButton = useRef<HTMLButtonElement>(null)
  const restoreKeyboardFocus = useRef(false)
  useLayoutEffect(() => {
    if (!restoreKeyboardFocus.current) return
    const frame = requestAnimationFrame(() => {
      if (!restoreKeyboardFocus.current) return
      restoreKeyboardFocus.current = false
      centerButton.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId])
  const navigate = (id: string | null, keyboard: boolean) => {
    restoreKeyboardFocus.current = keyboard && id !== selectedId
    onSelect(id)
  }
  const selected = selectedId ? model.byId.get(selectedId) : undefined
  const parent = selected?.pathIds.at(-2) ? model.byId.get(selected.pathIds.at(-2)!) : undefined
  const children = selected ? selected.children : model.roots
  const branch = rolePermissionPage(children, branchPage, ROLE_GRAPH_BRANCH_SIZE)
  const hasRoute = selected?.path !== null && selected?.path !== '' && selected?.path !== undefined
  const CenterIcon = selected ? permissionNodeIcons[selected.type] : ShieldCheck
  const ParentIcon = parent ? permissionNodeIcons[parent.type] : ShieldCheck

  const conduitLinks = useMemo<ConduitLink[]>(() => {
    const links: ConduitLink[] = []
    if (selected) {
      links.push({
        id: 'branch-parent-to-current',
        from: 'branch-parent-anchor',
        to: 'branch-center-anchor',
        enabled: selected.assigned,
        scope: selected.assigned ? 'STANDARD' : 'BROKEN',
      })
    }
    for (const id of branch.items) {
      const node = model.byId.get(id)
      links.push({
        id: `branch-child-${id}`,
        from: 'branch-center-anchor',
        to: `branch-child-anchor-${id}`,
        enabled: Boolean(node?.assigned),
        scope: node?.assigned ? 'STANDARD' : 'BROKEN',
      })
    }
    if (selected && children.length === 0 && hasRoute) {
      links.push({
        id: 'branch-leaf-route',
        from: 'branch-center-anchor',
        to: 'branch-leaf-anchor',
        enabled: true,
        scope: 'ALL',
      })
    }
    return links
  }, [branch.items, children.length, hasRoute, model.byId, selected])

  return (
    <div className="role-permission-visual">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 text-xs text-muted-foreground">
        <span>{t('roleGraph.nextLevel')}</span>
        <span>{t('roleGraph.branchCount', { count: children.length })}</span>
      </div>

      <div
        ref={stageRef}
        role="group"
        aria-label={t('roleGraph.graph')}
        className="relative p-4 sm:p-5"
      >
        <FluidConduitOverlay
          containerRef={stageRef}
          links={conduitLinks}
          flow="horizontal"
          minContainerWidth={560}
          pulseKey={`${selectedId ?? 'root'}-${branch.page}`}
        />

        <div
          className={cn(
            'relative z-[2] grid items-center gap-6 md:gap-11',
            selected
              ? 'md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.25fr)]'
              : 'md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]',
          )}
        >
          {selected && (
            <button
              type="button"
              data-conduit-anchor="branch-parent-anchor"
              className="flex items-center gap-2.5 rounded-panel border border-border-subtle bg-card/90 p-3 text-left transition-colors hover:border-brand-text/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('roleGraph.returnTo', { name: parent?.name ?? role.roleName })}
              onClick={(event) => navigate(parent?.id ?? null, event.detail === 0)}
            >
              <ParentIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {parent?.name ?? role.roleName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {parent ? t(`roleGraph.${parent.type}`) : t('roleGraph.configured')}
                </span>
              </span>
            </button>
          )}

          <button
            ref={centerButton}
            type="button"
            data-conduit-anchor="branch-center-anchor"
            aria-pressed
            aria-label={
              selected ? t('roleGraph.inspect', { name: selected.name }) : t('roleGraph.reset')
            }
            onClick={(event) => navigate(selected?.id ?? null, event.detail === 0)}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-panel"
          >
            <SketchBox seed={23} wash="normal" className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-primary/14 text-brand-text">
                  <CenterIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {selected?.name ?? role.roleName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected
                      ? t(selected.assigned ? 'roleGraph.direct' : 'roleGraph.context')
                      : `${model.assignedCount} · ${t('roleGraph.assignments')}`}
                  </p>
                </div>
              </div>
            </SketchBox>
          </button>

          <div className="space-y-2">
            {branch.items.map((id) => {
              const node = model.byId.get(id)!
              const NodeIcon = permissionNodeIcons[node.type]
              return (
                <button
                  key={id}
                  type="button"
                  data-conduit-anchor={`branch-child-anchor-${id}`}
                  aria-label={t('roleGraph.inspect', { name: node.name })}
                  aria-pressed={false}
                  onClick={(event) => navigate(node.id, event.detail === 0)}
                  className="flex w-full items-center gap-2.5 rounded-panel border border-border-subtle bg-card/90 p-3 text-left transition-colors hover:border-brand-text/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <NodeIcon className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{node.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(node.assigned ? 'roleGraph.direct' : 'roleGraph.context')}
                    </span>
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    {t(`roleGraph.${node.type}`)}
                  </Badge>
                </button>
              )
            })}

            {selected && children.length === 0 && (
              <div
                data-conduit-anchor="branch-leaf-anchor"
                className="rounded-panel border border-border-subtle bg-card/90 p-4"
              >
                <KeyRound aria-hidden="true" className="mb-2 size-4 text-brand-text" />
                <p className="text-xs text-muted-foreground">
                  {t(hasRoute ? 'roleGraph.identifier' : 'roleGraph.leaf')}
                </p>
                {hasRoute ? (
                  <code className="mt-1.5 block break-all font-mono text-sm">{selected.path}</code>
                ) : (
                  <p className="mt-1.5 text-sm">{t('roleGraph.noIdentifier')}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 pb-5">
        <RoleGraphPagination page={branch.page} pages={branch.pageCount} onPage={onBranchPage} />
        <div
          className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-2">
            <span className="role-graph-legend-direct h-px w-5" />
            {t('roleGraph.direct')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="role-graph-legend-context w-5 border-t border-dashed" />
            {t('roleGraph.context')}
          </span>
        </div>
      </div>
    </div>
  )
}
