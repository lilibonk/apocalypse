import type { ReactNode } from 'react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export interface ResponsiveInspectorProps {
  /** Accessible title of the inspector region / Sheet. */
  title: string
  /** Optional subtitle or selected entity context description. */
  context?: string
  /** Controlled Sheet open state (used in 'sheet' mode or narrow container drawer mode). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * 'auto' (default): renders a sticky `height: fit-content` card on wide containers (`>= 68rem`)
   * and a slide-over Sheet when `open` is true on narrow containers.
   * 'sheet': renders only as a slide-over Sheet drawer (e.g., OperLog / Calendar detail drawer).
   * 'inline': renders only the sticky `height: fit-content` card.
   */
  mode?: 'auto' | 'sheet' | 'inline'
  /** Optional action cluster rendered above the body (e.g. previous / next record). */
  headerActions?: ReactNode
  children: ReactNode
  className?: string
  sheetClassName?: string
}

/**
 * Adaptive inspector container enforcing `height: fit-content` and independent internal scrolling
 * on wide viewports while degrading cleanly to a Radix Sheet drawer on narrow viewports.
 */
export function ResponsiveInspector({
  title,
  context,
  open = false,
  onOpenChange,
  mode = 'auto',
  headerActions,
  children,
  className,
  sheetClassName,
}: ResponsiveInspectorProps) {
  if (mode === 'sheet') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className={cn('w-full overflow-y-auto p-5 sm:max-w-lg', sheetClassName)}>
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{context ?? title}</SheetDescription>
          </SheetHeader>
          {headerActions}
          <div className="space-y-4">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <>
      <aside
        aria-label={title}
        data-slot="responsive-inspector"
        data-responsive-mode={mode}
        className={cn('sticky-rail-inspector space-y-4', className)}
      >
        {headerActions}
        {children}
      </aside>
      {mode === 'auto' && onOpenChange && (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent className={cn('w-full overflow-y-auto p-5 sm:max-w-md', sheetClassName)}>
            <SheetHeader className="sr-only">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{context ?? title}</SheetDescription>
            </SheetHeader>
            {headerActions}
            <div className="space-y-4">{children}</div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
