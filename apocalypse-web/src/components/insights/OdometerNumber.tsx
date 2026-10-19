import type { CSSProperties } from 'react'

import { stateMotion } from '@/design/motion'
import { cn } from '@/lib/utils'

import { odometerColumns, odometerDelay, type OdometerColumn } from './odometer'
import './insights.css'

/**
 * Per-digit reels driven by CSS transitions (tokens.css owns duration/easing and the global motion
 * kill-switches). Retargeting mid-flight continues from the current computed position, so rapid
 * range switches never show intermediate wrong values once settled. Screen readers get the final
 * formatted value only.
 */
export function OdometerNumber({
  formatted,
  enabled,
  className,
}: {
  formatted: string
  enabled: boolean
  className?: string
}) {
  const columns = odometerColumns(formatted)
  return (
    <span className={cn('odometer', className)} data-instant={enabled ? undefined : ''}>
      <span aria-hidden="true" className="odometer-track">
        {columns.map((column) =>
          column.digit === null ? (
            <span key={column.key} className="odometer-glyph">
              {column.char}
            </span>
          ) : (
            <Reel key={column.key} column={column} enabled={enabled} />
          ),
        )}
      </span>
      <span className="sr-only">{formatted}</span>
    </span>
  )
}

function Reel({ column, enabled }: { column: OdometerColumn; enabled: boolean }) {
  // New reels roll from 0 via CSS @starting-style; no effect or timer is needed.
  const style = {
    '--odometer-digit': column.digit ?? 0,
    transitionDelay: enabled ? `${odometerDelay(column, stateMotion.odometerStagger)}s` : undefined,
  } as CSSProperties
  return (
    <span className="odometer-reel">
      <span className="odometer-strip" style={style}>
        {'0123456789'.split('').map((value) => (
          <span key={value}>{value}</span>
        ))}
      </span>
      {/* In-flow sizer keeps the reel exactly one tabular digit wide. */}
      <span className="odometer-sizer">{column.char}</span>
    </span>
  )
}
