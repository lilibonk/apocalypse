import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  BookOpen,
  CalendarDays,
  KeyRound,
  LayoutList,
  Radio,
  ScrollText,
  Shield,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import type { ComponentType, MouseEvent } from 'react'
import { useNavigate } from 'react-router'

import { useMenuRoute } from '@/hooks/useMenuRoute'
import { cn } from '@/lib/utils'
import {
  buildEntityRouteTarget,
  ENTITY_COMPONENT_MAP,
  type EntityKind,
  type EntityRelation,
  type EntityRouteIntent,
  type EntitySourceRef,
} from './entity-intent'

const KIND_ICONS: Record<EntityKind, ComponentType<{ className?: string }>> = {
  role: Shield,
  user: UserRound,
  dept: Building2,
  permission: KeyRound,
  menu: LayoutList,
  session: Radio,
  dict: BookOpen,
  config: SlidersHorizontal,
  calendar: CalendarDays,
  'log-login': Activity,
  'log-oper': ScrollText,
}

const STATUS_DOT_CLASS: Record<'active' | 'warning' | 'inactive', string> = {
  active: 'bg-success',
  warning: 'bg-warning',
  inactive: 'bg-muted-foreground/50',
}

export interface EntityPillProps {
  /** Explicit route intent object; can be omitted if `kind` (or `type`) + `id` are provided directly. */
  intent?: EntityRouteIntent
  /** Shorthand entity kind when `intent` is not passed separately. */
  kind?: EntityKind
  /** Alias for `kind` to support ergonomic JSX call sites (`<EntityPill type="role" ... />`). */
  type?: EntityKind
  /** Shorthand entity ID when `intent` is not passed separately. */
  id?: string
  /** Primary display text of the pill. */
  label: string
  /** Optional monospace or secondary sublabel (e.g. `super_admin`, `system:user:edit`, deptName). */
  sublabel?: string | null
  /** Optional relation lens when using shorthand props. */
  relation?: EntityRelation
  /** Optional focus target ID when using shorthand props. */
  focusTargetId?: string
  /** Optional module key when using shorthand props. */
  moduleKey?: string
  /** Optional group key when using shorthand props. */
  groupKey?: string
  /** Optional source reference for back-navigation breadcrumb pill. */
  source?: EntitySourceRef
  /** Optional status indicator dot. */
  statusTone?: 'active' | 'warning' | 'inactive'
  /** Pill size variant: 'sm' for dense lists/HUDs, 'md' for inspectors and cards. */
  size?: 'sm' | 'md'
  /** Show trailing navigation micro-arrow when interactive (default true). */
  showArrow?: boolean
  /** Force non-interactive read-only badge mode even if route is authorized. */
  interactive?: boolean
  /** Optional callback fired right before navigation (e.g. closing CommandPalette). */
  onNavigate?: (intent: EntityRouteIntent) => void
  className?: string
}

/**
 * Permission-aware cross-page Entity Pill.
 * Resolves the target route via `useMenuRoute(ENTITY_COMPONENT_MAP[kind])`. When the viewer lacks
 * menu access to the destination workspace, degrades automatically to a read-only semantic pill.
 */
export function EntityPill({
  intent: explicitIntent,
  kind: propKind,
  type: propType,
  id: propId,
  label,
  sublabel,
  relation,
  focusTargetId,
  moduleKey,
  groupKey,
  source,
  statusTone,
  size = 'sm',
  showArrow = true,
  interactive = true,
  onNavigate,
  className,
}: EntityPillProps) {
  const navigate = useNavigate()
  const resolvedKind = explicitIntent?.kind ?? propKind ?? propType ?? 'user'
  const resolvedId = explicitIntent?.id ?? propId ?? label

  const resolvedIntent: EntityRouteIntent = explicitIntent ?? {
    kind: resolvedKind,
    id: resolvedId,
    label,
    relation,
    focusTargetId,
    moduleKey,
    groupKey,
    source,
    triggerPulse: true,
  }

  const authorizedPath = useMenuRoute(ENTITY_COMPONENT_MAP[resolvedIntent.kind])
  const canNavigate = interactive && Boolean(authorizedPath) && Boolean(resolvedIntent.id)
  const Icon = KIND_ICONS[resolvedIntent.kind]

  const content = (
    <>
      {statusTone ? (
        <span
          data-slot="entity-pill-status"
          className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT_CLASS[statusTone])}
          aria-hidden="true"
        />
      ) : (
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span data-slot="entity-pill-label" className="truncate">
        {label}
      </span>
      {sublabel && (
        <span
          data-slot="entity-pill-sublabel"
          className="truncate font-mono text-[11px] text-muted-foreground"
        >
          {sublabel}
        </span>
      )}
      {canNavigate && showArrow && (
        <ArrowUpRight
          className="size-3 shrink-0 text-muted-foreground opacity-75"
          aria-hidden="true"
        />
      )}
    </>
  )

  const sizeClass = size === 'md' ? 'h-7 px-2.5 text-xs' : 'h-6 px-2 text-xs'

  if (!canNavigate || !authorizedPath) {
    return (
      <span
        data-slot="entity-pill"
        data-entity-kind={resolvedIntent.kind}
        data-entity-id={resolvedIntent.id}
        data-interactive="false"
        data-size={size}
        className={cn('entity-pill', sizeClass, className)}
      >
        {content}
      </span>
    )
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onNavigate?.(resolvedIntent)
    const target = buildEntityRouteTarget(authorizedPath, resolvedIntent)
    navigate({ pathname: target.pathname, search: target.search }, { state: target.state })
  }

  return (
    <button
      type="button"
      data-slot="entity-pill"
      data-entity-kind={resolvedIntent.kind}
      data-entity-id={resolvedIntent.id}
      data-interactive="true"
      data-size={size}
      onClick={handleClick}
      className={cn('entity-pill', sizeClass, className)}
    >
      {content}
    </button>
  )
}

export interface EntityReturnPillProps {
  source: EntitySourceRef
  prefixLabel?: string
  className?: string
}

/**
 * Renders a compact `< Back to {source.label}` pill in the top-left HUD or workspace header
 * when a user arrived via an EntityPill with `source` context.
 */
export function EntityReturnPill({
  source,
  prefixLabel = '返回',
  className,
}: EntityReturnPillProps) {
  const navigate = useNavigate()
  const authorizedPath = useMenuRoute(ENTITY_COMPONENT_MAP[source.kind])
  const targetPath = source.path ?? authorizedPath

  if (!targetPath) return null

  return (
    <button
      type="button"
      data-slot="entity-return-pill"
      data-size="sm"
      data-interactive="true"
      onClick={() => {
        const target = buildEntityRouteTarget(targetPath, {
          kind: source.kind,
          id: source.id,
          label: source.label,
          triggerPulse: true,
        })
        navigate({ pathname: target.pathname, search: target.search }, { state: target.state })
      }}
      className={cn('entity-pill h-6 px-2 text-xs', className)}
    >
      <ArrowLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">
        {prefixLabel} · {source.label}
      </span>
    </button>
  )
}
