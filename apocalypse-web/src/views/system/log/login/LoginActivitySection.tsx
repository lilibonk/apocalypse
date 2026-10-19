/**
 * Desktop sign-in overview above the log table: server-aggregated range statistics and a
 * weekday × hour heatmap. Recorded zeros, uncovered hours and failure concentration are distinct
 * and explained in the legend; every cell is keyboard reachable with a text readout.
 */
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimatedNumber } from '@/components/insights/AnimatedNumber'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { stateMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { ApiError } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import {
  getLoginHeatmap,
  getLoginInsights,
  type LoginHeatmap,
  type LoginHeatmapCell,
} from '@/views/system/log/log-insight.api'

import {
  FAILURE_MIN,
  FAILURE_RATIO,
  failureConcentrated,
  heatLevel,
  heatmapRows,
  moveCell,
} from './login-heatmap.model'
import './login-heatmap.css'

type HeatRange = 'WEEK' | 'MONTH'

const pad = (hour: number) => String(hour).padStart(2, '0')

export function LoginActivitySection() {
  const { t, i18n } = useTranslation('system')
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh'
  const motionEnabled = useMotionPreference()
  const epoch = useAuthStore((state) => state.sessionEpoch)
  const [range, setRange] = useState<HeatRange>('WEEK')
  const [open, setOpen] = useState(true)
  const insights = useQuery({
    queryKey: ['system', 'logs', 'login', 'insights', epoch, range],
    queryFn: ({ signal }) => getLoginInsights(range, signal),
    enabled: open,
  })
  const heatmap = useQuery({
    queryKey: ['system', 'logs', 'login', 'heatmap', epoch, range],
    queryFn: ({ signal }) => getLoginHeatmap(range, signal),
    enabled: open,
  })
  const stats = insights.data
  const successRate = stats && stats.total > 0 ? (stats.succeeded / stats.total) * 100 : null
  return (
    <section aria-labelledby="login-activity-title" className="login-activity rounded-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="login-activity-title" className="font-semibold">
            {t('logInsight.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('logInsight.hint')}</p>
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <div
              className="login-activity-range flex gap-1 rounded-full p-1"
              role="group"
              aria-label={t('logInsight.range')}
            >
              {(['WEEK', 'MONTH'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={range === option}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setRange(option)}
                >
                  {t(`logInsight.range${option}`)}
                </button>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls="login-activity-body"
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown
              data-slot="motion-disclosure-indicator"
              className={open ? 'rotate-180' : undefined}
              aria-hidden="true"
            />
            {t(open ? 'logInsight.collapse' : 'logInsight.expand')}
          </Button>
        </div>
      </div>
      {open && (
        <div id="login-activity-body" className="mt-4 space-y-4">
          {insights.isError || heatmap.isError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-control bg-muted p-3 text-sm"
            >
              <span className="min-w-0 flex-1">
                {(insights.error ?? heatmap.error) instanceof ApiError
                  ? ((insights.error ?? heatmap.error) as ApiError).message
                  : t('logInsight.failed')}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void insights.refetch()
                  void heatmap.refetch()
                }}
              >
                {t('logInsight.retry')}
              </Button>
            </div>
          ) : null}
          {!stats ? (
            insights.isPending && <Skeleton className="h-14 w-full" />
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-5">
              {(
                [
                  ['total', stats.total, 0],
                  ['successRate', successRate, 1],
                  ['failedCount', stats.failed, 0],
                  ['accounts', stats.distinctUsers, 0],
                  ['ips', stats.distinctIps, 0],
                ] as const
              ).map(([key, value, decimals]) => (
                <div key={key}>
                  <dt className="text-muted-foreground">{t(`logInsight.${key}`)}</dt>
                  <dd className="insight-metric mt-1 text-2xl font-medium">
                    {value === null ? (
                      '—'
                    ) : (
                      <>
                        <AnimatedNumber
                          value={value}
                          decimals={decimals}
                          language={language}
                          variant="odometer"
                        />
                        {key === 'successRate' && (
                          <span className="ml-0.5 text-sm text-muted-foreground">%</span>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {heatmap.data ? (
            <Heatmap data={heatmap.data} motionEnabled={motionEnabled} />
          ) : (
            heatmap.isPending && <Skeleton className="h-48 w-full" />
          )}
        </div>
      )}
    </section>
  )
}

function Heatmap({ data, motionEnabled }: { data: LoginHeatmap; motionEnabled: boolean }) {
  const { t } = useTranslation('system')
  const rows = heatmapRows(data.cells)
  const [focus, setFocus] = useState({ row: 0, column: new Date().getHours() })
  const [hovered, setHovered] = useState<LoginHeatmapCell | null>(null)
  // The wave plays only for the first data this section receives; later ranges recolour in place.
  const [firstData, setFirstData] = useState<LoginHeatmap | null>(null)
  if (!firstData) setFirstData(data)
  const wave = motionEnabled && data === firstData
  const weekday = (day: number) => t(`logInsight.weekday${day}`)
  const describe = (cell: LoginHeatmapCell) =>
    cell.slots === 0
      ? t('logInsight.cellUncovered', { day: weekday(cell.isoWeekday), hour: pad(cell.hour) })
      : t('logInsight.cellReadout', {
          day: weekday(cell.isoWeekday),
          hour: pad(cell.hour),
          next: pad(cell.hour + 1),
          total: cell.total,
          failed: cell.failed,
        })
  const shown = hovered ?? rows[focus.row][focus.column]
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = moveCell(focus, event.key)
    if (!next) return
    event.preventDefault()
    setFocus(next)
    setHovered(null)
    event.currentTarget
      .querySelector<HTMLElement>(`[data-cell="${next.row}-${next.column}"]`)
      ?.focus()
  }
  return (
    <div className="space-y-3">
      <div
        role="grid"
        aria-label={t('logInsight.heatmapLabel', { zone: data.zone, offset: data.utcOffset })}
        aria-readonly="true"
        className="login-heatmap"
        data-wave={wave || undefined}
        onKeyDown={onKeyDown}
      >
        <div role="row" className="login-heatmap-row" aria-hidden="true">
          <span className="login-heatmap-day" />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="login-heatmap-hour">
              {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
            </span>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div role="row" key={rowIndex} className="login-heatmap-row">
            <span role="rowheader" className="login-heatmap-day">
              {weekday(rowIndex + 1)}
            </span>
            {row.map((cell, column) => {
              const focused = focus.row === rowIndex && focus.column === column
              const style = {
                '--heat-column': column,
                animationDelay: wave ? `${column * stateMotion.heatColumnDelay}s` : undefined,
              } as CSSProperties
              return (
                <div
                  key={column}
                  role="gridcell"
                  tabIndex={focused ? 0 : -1}
                  data-cell={`${rowIndex}-${column}`}
                  data-level={cell.slots === 0 ? undefined : heatLevel(cell.total, data.maxCell)}
                  data-uncovered={cell.slots === 0 || undefined}
                  data-failure={failureConcentrated(cell) || undefined}
                  aria-label={describe(cell)}
                  className="login-heatmap-cell"
                  style={style}
                  onFocus={() => setFocus({ row: rowIndex, column })}
                  onPointerEnter={() => setHovered(cell)}
                  onPointerLeave={() => setHovered(null)}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite" className="min-h-5 font-medium text-foreground">
          {describe(shown)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            {t('logInsight.less')}
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className="login-heatmap-swatch" data-level={level} />
            ))}
            {t('logInsight.more')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="login-heatmap-swatch" data-uncovered="" />
            {t('logInsight.uncovered')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="login-heatmap-swatch" data-level={2} data-failure="" />
            {t('logInsight.failureLegend', {
              min: FAILURE_MIN,
              ratio: Math.round(FAILURE_RATIO * 100),
            })}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('logInsight.window', {
          from: data.coveredFrom,
          to: data.to,
          zone: data.zone,
          offset: data.utcOffset,
        })}
      </p>
    </div>
  )
}
