import type { ComponentType, HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { ResponsiveInspector } from './ResponsiveInspector'

export interface CompactRailItem {
  key: string
  label: string
  /** Optional count badge on the right side of the rail item (e.g., group item count in frame 1030). */
  count?: number
  /** Whether this group/section contains unsaved draft changes (renders `.draft-marker` blue dot). */
  dirty?: boolean
  /** Number of unsaved draft items in this group. */
  dirtyCount?: number
  /** Whether this group/section has a 409 version conflict (renders warning amber dot). */
  conflict?: boolean
  /** Optional secondary badge text (e.g., disabled module label). */
  badge?: string
  icon?: ComponentType<{ className?: string }>
}

export interface StickyCompactRailProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  railLabel: string
  items?: readonly CompactRailItem[]
  activeKey?: string
  onSelect?: (key: string) => void
  railHeader?: ReactNode
  railFooter?: ReactNode
  children?: ReactNode
}

/**
 * Standalone sticky compact locator rail (`height: fit-content; position: sticky; top: 1rem`).
 * Can render either structured `items` or custom `children` locator streams.
 */
export function StickyCompactRail({
  railLabel,
  items,
  activeKey,
  onSelect,
  railHeader,
  railFooter,
  children,
  className,
  ...rest
}: StickyCompactRailProps) {
  return (
    <nav
      aria-label={railLabel}
      data-slot="sticky-compact-rail"
      className={cn('sticky-compact-rail', className)}
      {...rest}
    >
      {railHeader != null && <div data-slot="rail-header">{railHeader}</div>}
      {items && items.length > 0 && (
        <div role="list" className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = item.key === activeKey
            return (
              <button
                key={item.key}
                type="button"
                aria-current={isActive ? 'true' : undefined}
                data-slot="compact-rail-item"
                data-active={isActive ? 'true' : 'false'}
                onClick={() => onSelect?.(item.key)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
                {item.dirty && (
                  <span
                    data-slot="rail-dirty-dot"
                    className="size-2 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
                {item.conflict && (
                  <span
                    data-slot="rail-conflict-dot"
                    className="size-2 shrink-0 rounded-full bg-warning"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {item.badge}
                  </span>
                )}
                {item.dirtyCount != null && item.dirtyCount > 0 && (
                  <span className="shrink-0 font-mono text-xs font-medium text-primary tabular-nums">
                    +{item.dirtyCount}
                  </span>
                )}
                {item.count != null && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {children}
      {railFooter != null && (
        <div data-slot="rail-footer" className="border-t border-border-subtle pt-2">
          {railFooter}
        </div>
      )}
    </nav>
  )
}

export interface StickyCompactRailLayoutProps {
  /** Accessible label for the left sticky locator rail. */
  railLabel: string
  /** Structured rail items (e.g., Config groups or Permission modules). */
  items?: readonly CompactRailItem[]
  activeKey?: string
  onSelect?: (key: string) => void
  /** Custom rail content stream (e.g., compact User account list or Calendar inheritance tree). */
  railContent?: ReactNode
  /** Optional header slot inside the sticky rail (e.g., quick search or filter pills). */
  railHeader?: ReactNode
  /** Optional footer slot inside the sticky rail. */
  railFooter?: ReactNode
  /**
   * 'compact' (default): `13.5rem` rail for groups/modules (frame 1030).
   * 'locator': `minmax(15rem, 18rem)` rail for account/calendar tree locators.
   */
  railWidth?: 'compact' | 'locator'
  /** Fluid primary stage content on the right. */
  children: ReactNode
  /** Optional right-side sticky `fit-content` inspector (degrades to Sheet on narrow containers). */
  inspector?: ReactNode
  inspectorTitle?: string
  inspectorContext?: string
  inspectorOpen?: boolean
  onInspectorOpenChange?: (open: boolean) => void
  className?: string
  railClassName?: string
  stageClassName?: string
  inspectorClassName?: string
}

/**
 * Skeleton B: Sticky Compact Rail + Fluid Primary Stage + Optional ResponsiveInspector.
 * Strictly enforces `align-items: start` so sparse rails or short inspectors never stretch
 * into tall empty white boxes.
 */
export function StickyCompactRailLayout({
  railLabel,
  items,
  activeKey,
  onSelect,
  railContent,
  railHeader,
  railFooter,
  railWidth = 'compact',
  children,
  inspector,
  inspectorTitle = '详情检视',
  inspectorContext,
  inspectorOpen,
  onInspectorOpenChange,
  className,
  railClassName,
  stageClassName,
  inspectorClassName,
}: StickyCompactRailLayoutProps) {
  const hasInspector = inspector != null

  return (
    <div
      data-slot="sticky-rail-layout"
      data-rail-width={railWidth}
      data-has-inspector={hasInspector ? 'true' : 'false'}
      className={cn('sticky-rail-layout', className)}
    >
      <StickyCompactRail
        railLabel={railLabel}
        items={items}
        activeKey={activeKey}
        onSelect={onSelect}
        railHeader={railHeader}
        railFooter={railFooter}
        className={railClassName}
      >
        {railContent}
      </StickyCompactRail>
      <div data-slot="sticky-rail-stage" className={cn('sticky-rail-stage', stageClassName)}>
        {children}
      </div>
      {hasInspector && (
        <ResponsiveInspector
          title={inspectorTitle}
          context={inspectorContext}
          open={inspectorOpen}
          onOpenChange={onInspectorOpenChange}
          mode="auto"
          className={inspectorClassName}
        >
          {inspector}
        </ResponsiveInspector>
      )}
    </div>
  )
}
