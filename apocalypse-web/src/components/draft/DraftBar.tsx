import { Eye, RotateCcw, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { PixelScale } from '@/effects/PixelWave'

import './draft.css'

/**
 * Floating unsaved-changes bar shared by draft-based editors. It only reflects state; saving,
 * discarding and review are owned by the page. Buttons stay operable without waiting for motion.
 */
export function DraftBar({
  count,
  saving,
  canSave = true,
  onReview,
  onDiscard,
  onSave,
}: {
  count: number
  saving: boolean
  canSave?: boolean
  onReview: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  if (count <= 0) return null
  return (
    <div className="draft-bar-anchor">
      <section
        role="region"
        aria-label={t('draft.region')}
        data-slot="draft-bar"
        className="draft-bar"
      >
        <span className="draft-bar-dot" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-medium" aria-live="polite">
          {t('draft.count', { count })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="draft-bar-ghost" onClick={onReview}>
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
              <PixelScale variant="inline" tone="current" />
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
