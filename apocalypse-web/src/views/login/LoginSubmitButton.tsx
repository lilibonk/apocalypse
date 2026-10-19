import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { PixelScale } from '@/effects/PixelWave'
import { cn } from '@/lib/utils'

import './login-submit.css'

export type SubmitPhase = 'idle' | 'waiting' | 'success'

/**
 * Login submit with a state morph: the same button element collapses into a waiting circle and
 * shows a check only after authentication is accepted. Failure returns to `idle` immediately.
 * With motion disabled there is no geometry change, only label and icon swaps. The element keeps
 * focus (aria-disabled instead of disabled) and the form guards duplicate submissions.
 */
export function LoginSubmitButton({ phase, morph }: { phase: SubmitPhase; morph: boolean }) {
  const { t } = useTranslation()
  const busy = phase !== 'idle'
  const collapsed = morph && busy
  const label =
    phase === 'success'
      ? t('login.succeeded')
      : phase === 'waiting'
        ? t('login.submitting')
        : t('login.submit')
  return (
    <div className="login-submit-track">
      <Button
        type="submit"
        data-slot="login-submit"
        data-phase={phase}
        data-collapsed={collapsed || undefined}
        aria-disabled={busy || undefined}
        aria-busy={phase === 'waiting' || undefined}
        aria-label={collapsed ? label : undefined}
        className={cn('login-submit h-11', busy && 'cursor-progress')}
      >
        {phase === 'success' ? (
          <Check className="login-submit-check size-5" aria-hidden="true" />
        ) : phase === 'waiting' ? (
          <PixelScale variant="inline" tone="current" />
        ) : null}
        {!collapsed && <span>{label}</span>}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {busy ? label : ''}
      </span>
    </div>
  )
}
