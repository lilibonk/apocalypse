import { PanelRightOpen } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { useRolePanelWidth } from './useRolePanelWidth'
import './role-workspace.css'

/** Presentation only: the owning relationship editor retains selection, drafts and revisions. */
export function RoleWorkspacePanels({
  children,
  inspector,
  title,
  context,
  hasSelection,
  open,
  onOpenChange,
  editing = false,
  footer,
}: {
  children: ReactNode
  inspector: ReactNode
  title: string
  context: string
  hasSelection: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: boolean
  footer?: ReactNode
}) {
  const { t } = useTranslation('system')
  const container = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const wide = useRolePanelWidth(container, 'inspector')
  return (
    <div ref={container} className="role-workspace-panels" data-layout={wide ? 'inline' : 'sheet'}>
      <div className="min-w-0 space-y-3">
        {!wide && hasSelection && (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(true)}>
              <PanelRightOpen className="size-4" />
              {t('roleManage.inspectSelection')}
            </Button>
          </div>
        )}
        {children}
      </div>
      {wide && (
        <aside className="role-workspace-inspector min-w-0 space-y-2" aria-label={title}>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">{context}</p>
          {inspector}
        </aside>
      )}
      <Sheet open={!wide && open} onOpenChange={onOpenChange}>
        <SheetContent
          ref={sheet}
          className="role-workspace-inspector-sheet sm:max-w-md"
          onOpenAutoFocus={(event) => {
            if (!editing) {
              event.preventDefault()
              sheet.current?.focus()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {context}
              {editing && <span className="mt-1 block">{t('roleManage.inspectorDraftHint')}</span>}
            </SheetDescription>
          </SheetHeader>
          <div className="role-workspace-inspector-content min-h-0 min-w-0 flex-1 overflow-y-auto pb-4">
            {inspector}
          </div>
          {footer && <SheetFooter>{footer}</SheetFooter>}
        </SheetContent>
      </Sheet>
    </div>
  )
}
