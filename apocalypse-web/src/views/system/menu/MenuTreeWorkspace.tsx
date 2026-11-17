/** Tree objects are a DynaLayer escape: selection expresses navigation ancestry, not grants. */
import { ChevronDown, ChevronRight, PanelRightOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Perm } from '@/components/Perm'
import { MenuIcon } from '@/components/layout/MenuIcon'
import { FluidConduitOverlay, type ConduitLink } from '@/components/motion'
import { EntityPeekLink, LivingContextBar, type EntitySourceRef } from '@/components/navigation'
import { ResponsiveInspector } from '@/components/spatial'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { menuAncestorPath, visibleMenuNodes } from './menu-workspace.model'
import { collectSubtreeIds, type MenuNode } from './menu.types'
import './menu-workspace.css'

interface Props {
  tree: MenuNode[]
  allTree: MenuNode[]
  collapsed: ReadonlySet<string>
  selectedId: string | null
  loading: boolean
  filtering: boolean
  source?: EntitySourceRef | null
  onSelect: (id: string) => void
  onToggle: (id: string, recursive?: boolean) => void
  onResetFilters: () => void
  onCreateChild: (node: MenuNode) => void
  onEdit: (node: MenuNode) => void
  onDelete: (node: MenuNode) => void
}

export function MenuTreeWorkspace(props: Props) {
  const { t } = useTranslation('system')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const rows = visibleMenuNodes(props.tree, props.collapsed)
  const path = props.selectedId ? menuAncestorPath(props.allTree, props.selectedId) : []
  const selected = path.at(-1)
  const pathIds = new Set(path.map((node) => node.id))
  const moveFocus = (id: string) =>
    list.current?.querySelector<HTMLElement>(`[data-menu-select="${id}"]`)?.focus()
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, node: MenuNode) => {
    const index = rows.findIndex((row) => row.node.id === node.id)
    let target: string | undefined
    if (event.key === 'ArrowDown') target = rows[index + 1]?.node.id
    else if (event.key === 'ArrowUp') target = rows[index - 1]?.node.id
    else if (event.key === 'Home') target = rows[0]?.node.id
    else if (event.key === 'End') target = rows.at(-1)?.node.id
    else if (event.key === 'ArrowRight' && node.children.length) {
      if (props.collapsed.has(node.id)) props.onToggle(node.id, event.altKey)
      else target = node.children[0]?.id
    } else if (event.key === 'ArrowLeft') {
      if (node.children.length && !props.collapsed.has(node.id))
        props.onToggle(node.id, event.altKey)
      else target = node.parentId
    } else return
    event.preventDefault()
    if (target) moveFocus(target)
  }

  return (
    <div className="menu-workspace p-4">
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <nav
          aria-label={t('menuWorkspace.path')}
          className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {path.length
            ? path.map((node, index) => (
                <span key={node.id} className="inline-flex min-w-0 items-center gap-1">
                  {index > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}
                  <button
                    type="button"
                    className="max-w-48 truncate rounded-control px-1 py-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => props.onSelect(node.id)}
                  >
                    {node.menuName}
                  </button>
                </span>
              ))
            : t('menuWorkspace.pick')}
        </nav>
        <Button
          size="sm"
          variant="outline"
          className="menu-workspace-open"
          disabled={!selected}
          onClick={() => setDetailsOpen(true)}
        >
          <PanelRightOpen aria-hidden="true" />
          {t('menuWorkspace.details')}
        </Button>
      </div>
      <div ref={gridRef} data-theme-stage="" className="relative">
        <FluidConduitOverlay
          containerRef={gridRef}
          flow="horizontal"
          minContainerWidth={720}
          links={
            selected
              ? ([
                  {
                    id: `menu-preview-${selected.id}`,
                    from: 'menu-selected-node',
                    to: 'menu-live-preview',
                    enabled: selected.status !== 0 && selected.visible !== 0,
                  },
                ] satisfies ConduitLink[])
              : []
          }
          pulseKey={selected?.id ?? 'none'}
        />
        <div className="menu-workspace-grid">
          <div
            ref={list}
            role="tree"
            aria-label={t('menuWorkspace.tree')}
            className="sketch-surface min-w-0 overflow-x-auto rounded-panel border border-border-subtle bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-muted/35 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-0.5 font-medium text-brand-text">
                {t('menuWorkspace.policyHint', {
                  defaultValue: '独立导航树 · 仅控制入口显隐，不授予 API 权限',
                })}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {rows.length} {t('menuWorkspace.tree')}
              </span>
            </div>
            {props.loading && <Skeleton className="m-4 h-36" />}
            {!props.loading && !rows.length && (
              <div className="space-y-3 p-6 text-center text-sm text-muted-foreground">
                <p>{t(props.filtering ? 'menuWorkspace.noMatches' : 'menuWorkspace.empty')}</p>
                {props.filtering && (
                  <Button variant="outline" size="sm" onClick={props.onResetFilters}>
                    {t('menuWorkspace.reset')}
                  </Button>
                )}
              </div>
            )}
            {rows.map(({ node, depth }) => {
              const isCollapsed = props.collapsed.has(node.id)
              const subtreeCount = node.children.length ? collectSubtreeIds(node).size - 1 : 0
              return (
                <div
                  key={node.id}
                  className="menu-node flex min-w-0 items-center gap-1 border-b border-border-subtle last:border-b-0"
                  data-path={pathIds.has(node.id) || undefined}
                  data-selected={props.selectedId === node.id || undefined}
                  data-conduit-anchor={
                    props.selectedId === node.id ? 'menu-selected-node' : undefined
                  }
                >
                  {depth > 0 && (
                    <span
                      aria-hidden="true"
                      className="flex shrink-0 items-center self-stretch pl-2"
                    >
                      {Array.from({ length: Math.min(depth, 6) }).map((_, guideIdx) => (
                        <span
                          key={guideIdx}
                          className="inline-block h-10 w-4 border-l border-border-subtle/80"
                        />
                      ))}
                    </span>
                  )}
                  {node.children.length ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      tabIndex={-1}
                      aria-label={t(
                        isCollapsed ? 'menuWorkspace.expand' : 'menuWorkspace.collapse',
                        {
                          name: node.menuName,
                        },
                      )}
                      onClick={(event) => props.onToggle(node.id, event.altKey)}
                    >
                      {isCollapsed ? (
                        <ChevronRight aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )}
                    </Button>
                  ) : (
                    <span className="w-8 shrink-0" />
                  )}
                  <button
                    type="button"
                    role="treeitem"
                    id={`menu-object-${node.id}`}
                    data-menu-select={node.id}
                    aria-level={depth + 1}
                    aria-selected={props.selectedId === node.id}
                    aria-expanded={node.children.length ? !isCollapsed : undefined}
                    className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-control py-2.5 pr-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,0.8fr)_auto]"
                    onClick={() => props.onSelect(node.id)}
                    onKeyDown={(event) => onKeyDown(event, node)}
                  >
                    <MenuIcon name={node.icon} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="break-words text-sm font-medium">{node.menuName}</span>
                        {isCollapsed && subtreeCount > 0 && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                            +{subtreeCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t(
                          node.menuType === 'C'
                            ? 'menuWorkspace.directory'
                            : node.menuType === 'M'
                              ? 'menuWorkspace.page'
                              : 'menuWorkspace.legacy',
                        )}
                        {node.children.length > 0 &&
                          ` · ${t('menuWorkspace.children', { count: node.children.length })}`}
                      </span>
                    </span>
                    <code className="hidden truncate font-mono text-xs text-muted-foreground sm:block">
                      {node.path || '—'}
                    </code>
                    <span className="shrink-0 space-y-1 text-right text-xs text-muted-foreground">
                      <span className="block">
                        {t(
                          node.visible === 1
                            ? 'menuWorkspace.visible'
                            : node.visible === 0
                              ? 'menuWorkspace.hidden'
                              : 'menuWorkspace.unknown',
                        )}
                      </span>
                      {node.status === 0 && (
                        <span className="block text-warning-foreground">
                          {t('menuWorkspace.disabled')}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
          <ResponsiveInspector
            title={t('menuWorkspace.details')}
            context={selected?.menuName}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            mode="auto"
            className="menu-workspace-aside min-w-0"
          >
            <MenuInspector
              node={selected}
              path={path}
              source={props.source}
              onSelect={props.onSelect}
              onCreateChild={props.onCreateChild}
              onEdit={props.onEdit}
              onDelete={props.onDelete}
            />
          </ResponsiveInspector>
        </div>
      </div>
    </div>
  )
}

export function MenuInspector({
  node,
  path,
  source,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
}: { node?: MenuNode; path: MenuNode[]; source?: EntitySourceRef | null } & Pick<
  Props,
  'onSelect' | 'onCreateChild' | 'onEdit' | 'onDelete'
>) {
  const { t } = useTranslation('system')
  const titleId = useId()
  if (!node) return <p className="p-2 text-sm text-muted-foreground">{t('menuWorkspace.pick')}</p>
  const parentNode = path.length > 1 ? path[path.length - 2] : undefined
  const sourceRef = { kind: 'menu' as const, id: node.id, label: node.menuName }

  return (
    <section aria-labelledby={titleId} className="sketch-surface divide-y divide-border-subtle">
      <div className="space-y-3 pb-3.5">
        {source && <LivingContextBar source={source} />}

        <div>
          <h2 id={titleId} className="break-words text-lg font-semibold">
            {node.menuName}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{path.map((item) => item.menuName).join(' / ')}</span>
            {parentNode && (
              <EntityPeekLink
                kind="menu"
                id={parentNode.id}
                label={parentNode.menuName}
                source={sourceRef}
                onNavigate={() => onSelect(parentNode.id)}
                className="text-xs"
              />
            )}
            <EntityPeekLink
              kind="role"
              id={node.id}
              focusTargetId={node.id}
              label={t('menuWorkspace.jumpToRoleNav')}
              relation="menus"
              source={sourceRef}
              className="text-xs"
            />
          </div>
        </div>

        <div
          data-slot="menu-live-preview"
          data-conduit-anchor="menu-live-preview"
          className="sketch-surface rounded-panel border border-border-subtle bg-muted/25 p-3 text-xs"
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="font-mono tracking-wider uppercase">LIVE PREVIEW</span>
            <span>
              {node.visible === 0 ? t('menuWorkspace.hidden') : t('menuWorkspace.visible')}
            </span>
          </div>
          <div className="space-y-1 rounded-control border border-border-subtle/70 bg-card/90 p-2">
            {parentNode && (
              <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground opacity-70">
                <MenuIcon name={parentNode.icon} className="size-3 shrink-0" />
                <span className="truncate">{parentNode.menuName}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-control border border-brand-text/30 bg-primary/14 px-2.5 py-1.5 font-medium text-brand-text shadow-xs">
              <MenuIcon name={node.icon} className="size-3.5 shrink-0" />
              <span className="truncate">{node.menuName}</span>
              {node.path && (
                <code className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                  {node.path}
                </code>
              )}
            </div>
            {node.children.slice(0, 2).map((child) => (
              <div
                key={child.id}
                className="ml-3 flex items-center gap-2 px-2 py-0.5 text-[11px] text-muted-foreground opacity-75"
              >
                <MenuIcon name={child.icon} className="size-3 shrink-0" />
                <span className="truncate">{child.menuName}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-control bg-muted px-2 py-1">
            {t(
              node.menuType === 'F'
                ? 'menuWorkspace.legacy'
                : node.menuType === 'C'
                  ? 'menuWorkspace.directory'
                  : 'menuWorkspace.page',
            )}
          </span>
          <span className="rounded-control bg-muted px-2 py-1">
            {t(
              node.status === 1
                ? 'menuWorkspace.enabled'
                : node.status === 0
                  ? 'menuWorkspace.disabled'
                  : 'menuWorkspace.unknown',
            )}
          </span>
          <span className="rounded-control bg-muted px-2 py-1">
            {t(
              node.visible === 1
                ? 'menuWorkspace.visible'
                : node.visible === 0
                  ? 'menuWorkspace.hidden'
                  : 'menuWorkspace.unknown',
            )}
          </span>
        </div>

        {node.menuType !== 'F' && (
          <div className="flex flex-wrap gap-2">
            <Perm perm="system:menu:add" requiresAllScope>
              <Button size="sm" variant="outline" onClick={() => onCreateChild(node)}>
                <Plus aria-hidden="true" />
                {t('menuWorkspace.addChild')}
              </Button>
            </Perm>
            <Perm perm="system:menu:edit" requiresAllScope>
              <Button size="sm" variant="outline" onClick={() => onEdit(node)}>
                <Pencil aria-hidden="true" />
                {t('menuWorkspace.edit')}
              </Button>
            </Perm>
            <Perm perm="system:menu:remove" requiresAllScope>
              <Button size="sm" variant="ghost" onClick={() => onDelete(node)}>
                <Trash2 className="text-destructive" aria-hidden="true" />
                {t('menuWorkspace.delete')}
              </Button>
            </Perm>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="py-3.5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t('menuWorkspace.children', { count: node.children.length })}
          </p>
          <ul className="space-y-1">
            {node.children.map((child) => (
              <li key={child.id}>
                <button
                  className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect(child.id)}
                >
                  <span className="min-w-0 break-words">{child.menuName}</span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-3.5">
        {node.remark && (
          <p className="mb-3 break-words text-sm text-muted-foreground">{node.remark}</p>
        )}
        <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
          {[
            ['route', node.path],
            ['component', node.component],
            ['permission', node.perms],
            ['sort', String(node.sort)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{t(`menuWorkspace.${label}`)}</dt>
              <dd className="mt-0.5 break-all font-mono">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
