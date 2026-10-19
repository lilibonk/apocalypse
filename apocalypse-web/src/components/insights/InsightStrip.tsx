/**
 * Compact insight strip for list pages (users, online sessions, permission catalog): a titled
 * InsightCard with odometer figures above the search. Figures come only from existing endpoints;
 * a figure the viewer cannot read is omitted rather than shown as zero. A figure with `href` links
 * to the page that owns it. Pages may add a footer (e.g. filter chips) as children.
 */
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { AnimatedNumber } from './AnimatedNumber'
import { InsightCard } from './InsightCard'

export interface InsightStripStat {
  key: string
  label: string
  /** null while loading; omit the stat entirely when the viewer may not read it. */
  value: number | null
  decimals?: number
  /** Short qualifier under the figure (scope, unit or source). */
  hint?: string
  href?: string
  /** Accessible name for the link; defaults to the label. */
  linkLabel?: string
}

export function InsightStrip({
  id,
  title,
  hint,
  stats,
  error,
  retryText,
  onRetry,
  entranceKey,
  children,
}: {
  id: string
  title: string
  hint?: string
  stats: readonly InsightStripStat[]
  /** First failure among the strip's sources; shown once above the figures. */
  error?: string | null
  retryText?: string
  onRetry?: () => void
  entranceKey: string
  children?: ReactNode
}) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'
  if (stats.length === 0 && !children) return null
  return (
    <InsightCard className="p-5" entranceKey={entranceKey} aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="font-semibold">
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {error && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-control bg-muted p-3 text-sm"
        >
          <span className="min-w-0 flex-1">{error}</span>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {retryText}
            </Button>
          )}
        </div>
      )}
      {stats.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
          {stats.map((stat) => {
            const figure =
              stat.value === null ? (
                <Skeleton className="mt-1 h-8 w-16" />
              ) : (
                <span className="insight-metric mt-1 block text-2xl font-medium">
                  <AnimatedNumber
                    value={stat.value}
                    decimals={stat.decimals ?? 0}
                    language={language}
                    variant="odometer"
                  />
                </span>
              )
            return (
              <div key={stat.key} className="min-w-0">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <span className="truncate">{stat.label}</span>
                  {stat.href && (
                    <Link
                      to={stat.href}
                      aria-label={stat.linkLabel ?? stat.label}
                      className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </dt>
                <dd>
                  {figure}
                  {stat.hint && (
                    <span className="mt-0.5 block leading-snug text-muted-foreground">
                      {stat.hint}
                    </span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
      {children}
    </InsightCard>
  )
}
