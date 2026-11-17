import { PanelRightOpen } from 'lucide-react'
import { useState, type HTMLAttributes, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type HudSlot = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'right-inspector'

export interface FloatingHudProps extends HTMLAttributes<HTMLElement> {
  /** Anchor slot within SpatialStage. */
  slot: HudSlot
  /** Accessible landmark label for this HUD region. */
  ariaLabel: string
  /** Height cap strategy: defaults to 'fit' (`height: fit-content; max-height: 100%; overflow-y: auto`). */
  maxHeight?: 'fit' | 'half-stage' | 'full-stage'
  /** Whether a `right-inspector` automatically collapses into a Sheet drawer when `@container main < 64rem`. */
  collapsibleOnNarrow?: boolean
  /** Trigger button label when collapsed on narrow containers. */
  narrowTriggerLabel?: string
  /** Controlled open state for the narrow Sheet drawer. */
  narrowOpen?: boolean
  onNarrowOpenChange?: (open: boolean) => void
  children: ReactNode
}

/**
 * Skeleton A companion: Corner-anchored floating HUD card over a SpatialStage.
 * Enforces `height: fit-content; max-height: 100%; overflow-y: auto` so sparse content wraps
 * tightly while dense content scrolls internally without stretching or clipping the stage.
 */
export function FloatingHud({
  slot,
  ariaLabel,
  maxHeight = 'fit',
  collapsibleOnNarrow = slot === 'right-inspector',
  narrowTriggerLabel,
  narrowOpen,
  onNarrowOpenChange,
  children,
  className,
  ...rest
}: FloatingHudProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isSheetOpen = narrowOpen ?? internalOpen
  const setSheetOpen = onNarrowOpenChange ?? setInternalOpen
  const shouldProvideNarrowSheet = slot === 'right-inspector' && collapsibleOnNarrow

  return (
    <>
      <aside
        aria-label={ariaLabel}
        data-slot={slot}
        data-hud-card="true"
        data-max-height={maxHeight}
        data-collapsible-narrow={shouldProvideNarrowSheet ? 'true' : 'false'}
        className={cn('floating-hud', className)}
        {...rest}
      >
        {children}
      </aside>
      {shouldProvideNarrowSheet && (
        <>
          <div className="floating-hud-narrow-trigger">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shadow-floating"
              onClick={() => setSheetOpen(true)}
            >
              <PanelRightOpen className="size-4" aria-hidden="true" />
              <span>{narrowTriggerLabel ?? ariaLabel}</span>
            </Button>
          </div>
          <Sheet open={isSheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-md">
              <SheetHeader className="sr-only">
                <SheetTitle>{ariaLabel}</SheetTitle>
                <SheetDescription>{narrowTriggerLabel ?? ariaLabel}</SheetDescription>
              </SheetHeader>
              <div className="mt-2 space-y-4">{children}</div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </>
  )
}
