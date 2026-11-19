import { Eye, RotateCcw, Save } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { PulseIndicator } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { formatModShortcut } from '@/lib/platform'

import './draft.css'

/**
 * Floating unsaved-changes bar shared by draft-based editors. It only reflects state; saving,
 * discarding and review are owned by the page. Buttons stay operable without waiting for motion.
 */
export function DraftBar({
  count,
  saving,
  canSave = true,
  conflictCount = 0,
  onReview,
  onDiscard,
  onSave,
}: {
  count: number
  saving: boolean
  canSave?: boolean
  conflictCount?: number
  onReview: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const active = count > 0 || conflictCount > 0

  useEffect(() => {
    if (!active || saving || typeof window === 'undefined') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 's') return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      event.preventDefault()
      onReview()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, onReview, saving])

  if (!active) return null

  return (
    <div className="draft-bar-anchor">
      <section
        role="region"
        aria-label={t('draft.region')}
        data-slot="draft-bar"
        data-has-conflicts={conflictCount > 0 ? 'true' : undefined}
        className="draft-bar"
      >
        <span className="draft-bar-dot" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center gap-2" aria-live="polite">
          <p className="truncate text-sm font-medium">{t('draft.count', { count })}</p>
          <kbd
            aria-hidden="true"
            className="hidden shrink-0 rounded border border-border-subtle bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-block"
          >
            {formatModShortcut('S')}
          </kbd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="draft-bar-ghost"
            aria-keyshortcuts="Control+S Meta+S"
            onClick={onReview}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            {t('draft.review')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="draft-bar-ghost"
            disabled={saving}
            onClick={onDiscard}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {t('draft.discard')}
          </Button>
          <Button size="sm" disabled={saving || !canSave} onClick={onSave}>
            {saving ? (
              <PulseIndicator variant="inline" tone="current" />
            ) : (
              <Save className="size-3.5" aria-hidden="true" />
            )}
            {saving ? t('draft.saving') : t('draft.save')}
          </Button>
        </div>
      </section>
    </div>
  )
}
