import { PanelRightOpen } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/** The readonly inspector follows the available space; DynaPage keeps all editable state. */
export function ObjectWorkspacePanels({
  children,
  inspector,
  title,
  context,
}: {
  children: (inspect: () => void) => ReactNode
  inspector: ReactNode
  title: string
  context: string
}) {
  const { t } = useTranslation('system')
  const ref = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () =>
      setWide(
        node.clientWidth >= 38 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className="object-workspace-layout" data-layout={wide ? 'inline' : 'sheet'}>
      <div className="min-w-0 space-y-3">
        {!wide && (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium">{context}</p>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <PanelRightOpen className="size-4" />
              {t('objectWorkspace.inspectSelected')}
            </Button>
          </div>
        )}
        {children(() => {
          if (!wide) setOpen(true)
        })}
      </div>
      {wide && (
        <aside className="object-workspace-inspector space-y-4" aria-label={title}>
          {inspector}
        </aside>
      )}
      <Sheet open={!wide && open} onOpenChange={setOpen}>
        <SheetContent
          ref={sheetRef}
          className="sm:max-w-md"
          onOpenAutoFocus={(event) => {
            // Start at the named inspector. Focusing a tooltip-wrapped action would consume Esc.
            event.preventDefault()
            sheetRef.current?.focus()
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{context}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 pb-6">{inspector}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
