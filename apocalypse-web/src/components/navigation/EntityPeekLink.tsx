import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  KeyRound,
  LayoutList,
  Radio,
  ScrollText,
  Shield,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import { HoverCard as HoverCardPrimitive } from 'radix-ui'
import type { ComponentType, MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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

export interface EntityPeekLinkProps {
  kind: EntityKind
  id: string
  label: string
  sublabel?: string | null
  summary?: ReactNode
  relation?: EntityRelation
  focusTargetId?: string
  moduleKey?: string
  groupKey?: string
  source?: EntitySourceRef
  interactive?: boolean
  onNavigate?: (intent: EntityRouteIntent) => void
  className?: string
}

/**
 * 原位语义预览与直达锚点（`<EntityPeekLink />`）：
 * 将正文/卡片头部字段原地升级为点划线交互入口，悬停在主题对应快览便签浮卡中预览上下游详情，
 * 点击写 `EntityRouteIntent` 穿透目标页；若当前账户无目标菜单权限，静默降级为纯只读文本。
 */
export function EntityPeekLink({
  kind,
  id,
  label,
  sublabel,
  summary,
  relation,
  focusTargetId,
  moduleKey,
  groupKey,
  source,
  interactive = true,
  onNavigate,
  className,
}: EntityPeekLinkProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const authorizedPath = useMenuRoute(ENTITY_COMPONENT_MAP[kind])
  const canNavigate = interactive && Boolean(authorizedPath) && Boolean(id)
  const Icon = KIND_ICONS[kind]

  const intent: EntityRouteIntent = {
    kind,
    id,
    label,
    relation,
    focusTargetId,
    moduleKey,
    groupKey,
    source,
    triggerPulse: true,
  }

  const jump = (event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation()
    if (!canNavigate || !authorizedPath) return
    onNavigate?.(intent)
    const target = buildEntityRouteTarget(authorizedPath, intent)
    navigate({ pathname: target.pathname, search: target.search }, { state: target.state })
  }

  if (!canNavigate) {
    return (
      <span
        data-slot="entity-peek-link"
        data-entity-kind={kind}
        data-entity-id={id}
        data-interactive="false"
        className={cn('inline-flex items-center gap-1 text-foreground', className)}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
    )
  }

  return (
    <HoverCardPrimitive.Root openDelay={180} closeDelay={100}>
      <HoverCardPrimitive.Trigger asChild>
        <button
          type="button"
          data-slot="entity-peek-link"
          data-entity-kind={kind}
          data-entity-id={id}
          data-interactive="true"
          onClick={jump}
          className={cn(
            'inline-flex max-w-full cursor-pointer items-center gap-1 rounded-sm font-medium text-brand-text underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ArrowUpRight className="size-3 shrink-0 opacity-75" aria-hidden="true" />
        </button>
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          sideOffset={8}
          align="start"
          className="entity-peek-card z-50 w-64 rounded-control p-3 text-xs outline-none"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-brand-text">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-semibold">{label}</p>
              {sublabel && (
                <p className="truncate font-mono text-[11px] text-muted-foreground">{sublabel}</p>
              )}
              {summary && <div className="leading-relaxed text-muted-foreground">{summary}</div>}
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-end border-t border-border-subtle pt-2">
            <button
              type="button"
              onClick={jump}
              className="inline-flex cursor-pointer items-center gap-1 font-medium text-brand-text hover:underline"
            >
              <span>{t('common.直达详情', { defaultValue: '直达详情' })}</span>
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </button>
          </div>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  )
}
