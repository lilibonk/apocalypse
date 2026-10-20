/** Tree objects are a DynaLayer escape: selection expresses navigation ancestry, not grants. */
import { ChevronDown, ChevronRight, PanelRightOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Perm } from '@/components/Perm'
import { MenuIcon } from '@/components/layout/MenuIcon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { menuAncestorPath, visibleMenuNodes } from './menu-workspace.model'
import type { MenuNode } from './menu.types'
import './menu-workspace.css'

interface Props {
  tree: MenuNode[]
  allTree: MenuNode[]
  collapsed: ReadonlySet<string>
  selectedId: string | null
  loading: boolean
  filtering: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onResetFilters: () => void
  onCreateChild: (node: MenuNode) => void
  onEdit: (node: MenuNode) => void
  onDelete: (node: MenuNode) => void
}

export function MenuTreeWorkspace(props: Props) {
  const { t } = useTranslation('system')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)
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
      if (props.collapsed.has(node.id)) props.onToggle(node.id)
      else target = node.children[0]?.id
    } else if (event.key === 'ArrowLeft') {
      if (node.children.length && !props.collapsed.has(node.id)) props.onToggle(node.id)
      else target = node.parentId
    } else return
    event.preventDefault()
    if (target) moveFocus(target)
  }
  const inspector = (
    <MenuInspector
      node={selected}
      path={path}
      onSelect={props.onSelect}
      onCreateChild={props.onCreateChild}
      onEdit={props.onEdit}
      onDelete={props.onDelete}
    />
  )
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
                    className="max-w-48 truncate rounded-control px-1 py-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
      <div className="menu-workspace-grid">
        <div
          ref={list}
          role="tree"
          aria-label={t('menuWorkspace.tree')}
          className="min-w-0 overflow-x-auto rounded-control border border-border-subtle"
        >
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
          {rows.map(({ node, depth }) => (
            <div
              key={node.id}
              className="menu-node flex min-w-0 items-center gap-1 border-b border-border-subtle last:border-b-0"
              data-path={pathIds.has(node.id) || undefined}
              data-selected={props.selectedId === node.id || undefined}
            >
              <div
                className="shrink-0"
                style={{ width: `calc(var(--spacing) * ${Math.min(depth, 6) * 4})` }}
              />
              {node.children.length ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  tabIndex={-1}
                  aria-label={t(
                    props.collapsed.has(node.id)
                      ? 'menuWorkspace.expand'
                      : 'menuWorkspace.collapse',
                    { name: node.menuName },
                  )}
                  onClick={() => props.onToggle(node.id)}
                >
                  {props.collapsed.has(node.id) ? (
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
                aria-expanded={node.children.length ? !props.collapsed.has(node.id) : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-control py-3 pr-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => props.onSelect(node.id)}
                onKeyDown={(event) => onKeyDown(event, node)}
              >
                <MenuIcon name={node.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{node.menuName}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
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
          ))}
        </div>
        <aside className="menu-workspace-aside min-w-0">{inspector}</aside>
      </div>
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>{t('menuWorkspace.details')}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{inspector}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function MenuInspector({
  node,
  path,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
}: { node?: MenuNode; path: MenuNode[] } & Pick<
  Props,
  'onSelect' | 'onCreateChild' | 'onEdit' | 'onDelete'
>) {
  const { t } = useTranslation('system')
  const titleId = useId()
  if (!node) return <p className="p-4 text-sm text-muted-foreground">{t('menuWorkspace.pick')}</p>
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-4 rounded-panel border border-border-subtle bg-card p-4"
    >
      <div>
        <p className="text-xs text-muted-foreground">{t('menuWorkspace.details')}</p>
        <h2 id={titleId} className="mt-1 break-words text-lg font-semibold">
          {node.menuName}
        </h2>
        <p className="mt-2 break-words text-xs text-muted-foreground">
          {path.map((item) => item.menuName).join(' / ')}
        </p>
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
      {node.children.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t('menuWorkspace.children', { count: node.children.length })}
          </p>
          <ul className="space-y-1">
            {node.children.map((child) => (
              <li key={child.id}>
                <button
                  className="flex w-full items-center justify-between gap-2 rounded-control p-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
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
      {node.remark && <p className="break-words text-sm text-muted-foreground">{node.remark}</p>}
      <details className="border-t border-border-subtle pt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          {t('menuWorkspace.trace')}
        </summary>
        <dl className="mt-3 space-y-3 text-xs">
          {[
            ['route', node.path],
            ['component', node.component],
            ['permission', node.perms],
            ['sort', String(node.sort)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{t(`menuWorkspace.${label}`)}</dt>
              <dd className="mt-1 break-all font-mono">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}
