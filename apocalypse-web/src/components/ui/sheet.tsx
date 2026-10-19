import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { useLayerFocusReturn } from '@/components/ui/layer-focus-return'

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn('fixed inset-0 z-50', className)}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showCloseButton?: boolean
}) {
  const { t } = useTranslation()
  const { handleCloseAutoFocus, handleOpenAutoFocus } = useLayerFocusReturn(
    onOpenAutoFocus,
    onCloseAutoFocus,
  )
  return (
    <SheetPortal>
      <SheetOverlay data-motion-preset="surface" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        data-motion-preset="surface"
        className={cn(
          'fixed z-50 flex max-h-dvh flex-col gap-4 overflow-y-auto border-border-subtle bg-popover text-popover-foreground shadow-floating outline-none',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-full border-l sm:max-w-sm sm:rounded-l-panel',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-full border-r sm:max-w-sm sm:rounded-r-panel',
          side === 'top' && 'inset-x-0 top-0 h-auto rounded-b-panel border-b',
          side === 'bottom' && 'inset-x-0 bottom-0 h-auto rounded-t-panel border-t',
          className,
        )}
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none"
          >
            <XIcon className="size-4" />
            <span className="sr-only">{t('common.关闭', { defaultValue: '关闭' })}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'flex shrink-0 flex-col gap-1.5 border-b border-border-subtle p-6 pr-14',
        className,
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'mt-auto flex shrink-0 flex-col gap-2 border-t border-border-subtle p-6',
        className,
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
