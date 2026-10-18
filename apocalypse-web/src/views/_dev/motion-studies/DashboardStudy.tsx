/** Custom data visualization study; the spatial charts and instrumentation exceed CRUD schema. */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  Clock3,
  FileDown,
  LogIn,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { studyMotion } from '@/design/motion'
import {
  chartDimensions,
  dashboardActivities,
  dashboardChart,
  dashboardRanges,
  dashboardSnapshots,
  distributionLabels,
  loginBucketLabel,
  rangeLabels,
  type DashboardActivity,
  type DashboardRange,
  type StudyLanguage,
} from './dashboard-data'
import type { StudyProps } from './types'
import { useStudyAnimation } from './useStudyAnimation'
import './dashboard-study.css'

const copy = {
  zh: {
    loginTitle: '登录趋势',
    loginHint: '团队与工作台的每一次连接',
    range: '统计时间范围',
    times: '次',
    people: '人',
    compared: '较上一周期',
    average: '日均登录',
    peak: '单日峰值',
    hourPeak: '小时峰值',
    logins: '查看登录明细',
    graph: '探索权限关系',
    members: '活跃成员',
    membersHint: '在所选时间范围内访问过工作台',
    events: '操作事件',
    eventsHint: '每一项变更，都有记录',
    success: '操作成功率',
    successHint: '让日常工作顺畅流转',
    passed: '成功',
    failed: '失败',
    distribution: '操作分布',
    distributionHint: '团队如何使用工作台',
    recent: '最近活动',
    recentHint: '10 月 18 日 · 今天',
    allRecorded: '所有活动均已留痕',
    sample: '本地示例数据 · 非真实业务统计',
    logDescription: '按所选时间范围查看示例登录次数。以下明细与趋势图使用同一份数据。',
    period: '时间',
    count: '登录次数',
    total: '合计',
    close: '关闭',
    activityDetails: '活动详情',
    person: '操作人',
    category: '所属分类',
    time: '记录时间',
    result: '执行结果',
    completed: '已完成',
    demoExplanation: '此活动为本地演示记录，人物与操作均为示例。',
  },
  en: {
    loginTitle: 'Sign-in activity',
    loginHint: 'Every connection to your workspace',
    range: 'Reporting period',
    times: 'visits',
    people: 'people',
    compared: 'vs. previous period',
    average: 'Daily average',
    peak: 'Daily peak',
    hourPeak: 'Hourly peak',
    logins: 'View sign-in details',
    graph: 'Explore access graph',
    members: 'Active members',
    membersHint: 'Visited the workspace during this period',
    events: 'Activity events',
    eventsHint: 'Every change has a record',
    success: 'Operation success',
    successHint: 'Keeping everyday work in motion',
    passed: 'Successful',
    failed: 'Failed',
    distribution: 'Activity breakdown',
    distributionHint: 'How your team uses the workspace',
    recent: 'Recent activity',
    recentHint: 'October 18 · Today',
    allRecorded: 'Every activity is accounted for',
    sample: 'Local sample data · No production statistics',
    logDescription:
      'Sample sign-ins for the selected period. These details use the same data as the chart.',
    period: 'Period',
    count: 'Sign-ins',
    total: 'Total',
    close: 'Close',
    activityDetails: 'Activity details',
    person: 'Member',
    category: 'Category',
    time: 'Recorded at',
    result: 'Result',
    completed: 'Completed',
    demoExplanation: 'This is a local demonstration. People and activities are fictional.',
  },
} as const

function AnimatedNumber({
  value,
  language,
  motionEnabled,
  decimals = 0,
}: {
  value: number
  language: StudyLanguage
  motionEnabled: boolean
  decimals?: number
}) {
  const current = useMotionValue(value)
  const formatter = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  const displayed = useTransform(current, (number) => formatter.format(number))
  useEffect(() => {
    if (!motionEnabled) {
      current.set(value)
      return
    }
    const playback = animate(current, value, studyMotion.number)
    return () => playback.stop()
  }, [current, motionEnabled, value])

  if (!motionEnabled) return <span>{formatter.format(value)}</span>

  return (
    <>
      <motion.span aria-hidden="true">{displayed}</motion.span>
      <span className="sr-only">{formatter.format(value)}</span>
    </>
  )
}

function StudyCard({
  children,
  className = '',
  motionEnabled,
  order,
}: {
  children: ReactNode
  className?: string
  motionEnabled: boolean
  order: number
}) {
  const controls = useStudyAnimation({ opacity: 1, y: 0 }, motionEnabled, {
    ...studyMotion.surface,
    delay: order * studyMotion.stagger,
  })
  return (
    <motion.section
      className={`study-card min-w-0 ${className}`}
      initial={motionEnabled ? { opacity: 0, y: studyMotion.enterOffset } : { opacity: 1, y: 0 }}
      animate={controls}
    >
      {children}
    </motion.section>
  )
}

function LoginChart({
  range,
  language,
  motionEnabled,
}: {
  range: DashboardRange
  language: StudyLanguage
  motionEnabled: boolean
}) {
  const gradientId = useId()
  const [hovered, setHovered] = useState<number | null>(null)
  const { logins, axisLabels } = dashboardSnapshots[range]
  const chart = dashboardChart(logins)
  const selected = hovered === null ? logins.length - 1 : Math.min(hovered, logins.length - 1)
  const { left, right, top, bottom } = chartDimensions
  const selectedX = left + (selected / (logins.length - 1)) * (right - left)
  const selectedY = bottom - (logins[selected] / chart.ceiling) * (bottom - top)
  const t = copy[language]
  const fillControls = useStudyAnimation({ d: chart.fill }, motionEnabled, studyMotion.chart)
  const pathControls = useStudyAnimation({ d: chart.path }, motionEnabled, studyMotion.chart)
  const pointControls = useStudyAnimation(
    { cx: selectedX, cy: selectedY },
    motionEnabled,
    studyMotion.chart,
  )

  return (
    <div className="min-w-0 self-end">
      <div className="mb-2 flex min-h-7 items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>{loginBucketLabel(range, selected, language)}</span>
        <span className="rounded-full bg-card/70 px-2 py-1 font-medium text-foreground tabular-nums">
          {logins[selected]} {t.times}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${chartDimensions.width} ${chartDimensions.height}`}
        className="dashboard-study-chart"
        role="img"
        aria-label={`${t.loginTitle}: ${rangeLabels[range][language]}`}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const svgX = ((event.clientX - bounds.left) / bounds.width) * chartDimensions.width
          const fraction = (svgX - left) / (right - left)
          setHovered(
            Math.max(0, Math.min(logins.length - 1, Math.round(fraction * (logins.length - 1)))),
          )
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={left}
            x2={right}
            y1={top + (bottom - top) * fraction}
            y2={top + (bottom - top) * fraction}
            className="dashboard-study-chart-grid"
          />
        ))}
        <motion.path
          initial={{ d: chart.fill }}
          animate={fillControls}
          fill={`url(#${gradientId})`}
        />
        <motion.path
          initial={{ d: chart.path }}
          animate={pathControls}
          className="dashboard-study-plot-line"
        />
        {hovered !== null && (
          <line
            x1={selectedX}
            x2={selectedX}
            y1={top}
            y2={bottom}
            className="dashboard-study-chart-grid"
          />
        )}
        <motion.circle
          initial={{ cx: selectedX, cy: selectedY }}
          animate={pointControls}
          r="4"
          className="dashboard-study-plot-dot"
        />
      </svg>
      <div
        className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums"
        aria-hidden="true"
      >
        {axisLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  )
}

function SuccessGauge({
  rate,
  language,
  motionEnabled,
}: {
  rate: number
  language: StudyLanguage
  motionEnabled: boolean
}) {
  return (
    <div className="relative mx-auto aspect-square w-44 max-w-full">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden="true">
        {Array.from({ length: 60 }, (_, index) => {
          const angle = (index / 60) * Math.PI * 2
          return (
            <line
              key={index}
              x1={100 + Math.cos(angle) * 81}
              y1={100 + Math.sin(angle) * 81}
              x2={100 + Math.cos(angle) * 91}
              y2={100 + Math.sin(angle) * 91}
              className="dashboard-study-gauge-tick"
              data-active={index < Math.round(rate * 0.6)}
              opacity={index < Math.round(rate * 0.6) ? 1 : 0.45}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <CircleCheck className="mb-1 size-5 text-brand-text" aria-hidden="true" />
        <div className="study-metric text-4xl font-medium">
          <AnimatedNumber
            value={rate}
            language={language}
            motionEnabled={motionEnabled}
            decimals={1}
          />
          <span className="ml-0.5 text-xl text-muted-foreground">%</span>
        </div>
        <span className="text-xs text-muted-foreground">{copy[language].passed}</span>
      </div>
    </div>
  )
}

function DistributionBar({
  value,
  total,
  category,
  motionEnabled,
}: {
  value: number
  total: number
  category: number
  motionEnabled: boolean
}) {
  const target = { width: `${(value / total) * 100}%` }
  const controls = useStudyAnimation(target, motionEnabled, studyMotion.layout)
  return (
    <motion.div
      className="h-full rounded-full"
      data-category={category}
      initial={target}
      animate={controls}
    />
  )
}

export function DashboardStudy({ language, motionEnabled, onOpenGraph }: StudyProps) {
  const [range, setRange] = useState<DashboardRange>('7d')
  const [details, setDetails] = useState<'logins' | DashboardActivity | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const snapshot = dashboardSnapshots[range]
  const total = snapshot.logins.reduce((sum, value) => sum + value, 0)
  const days = range === '24h' ? 1 : range === '7d' ? 7 : 30
  const successRate =
    ((snapshot.operations - snapshot.failedOperations) / snapshot.operations) * 100
  const t = copy[language]
  const formatter = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US')
  const openDetails = (next: 'logins' | DashboardActivity) => {
    setDetails(next)
    setDetailsOpen(true)
  }

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard-study">
      <div className="dashboard-study-top grid gap-4">
        <StudyCard
          className="dashboard-study-hero flex flex-col p-5 sm:p-7"
          motionEnabled={motionEnabled}
          order={0}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">{t.loginTitle}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.loginHint}</p>
            </div>
            <div className="dashboard-study-range flex gap-1 p-1" role="group" aria-label={t.range}>
              {dashboardRanges.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-full px-3 py-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-pressed={range === item}
                  onClick={() => setRange(item)}
                >
                  {rangeLabels[item][language]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-7 grid flex-1 items-end gap-6 xl:grid-cols-[0.7fr_1.3fr]">
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="study-metric text-6xl font-medium 2xl:text-7xl">
                    <AnimatedNumber
                      value={total}
                      language={language}
                      motionEnabled={motionEnabled}
                    />
                  </span>
                  <span className="text-sm text-muted-foreground">{t.times}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-success px-2 py-1 font-medium text-success-foreground">
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                    {snapshot.growth}%
                  </span>
                  <span className="text-muted-foreground">{t.compared}</span>
                </div>
              </div>
              <dl className="flex gap-8 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t.average}</dt>
                  <dd className="mt-1.5 text-base font-medium tabular-nums">
                    <AnimatedNumber
                      value={Math.round(total / days)}
                      language={language}
                      motionEnabled={motionEnabled}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{range === '24h' ? t.hourPeak : t.peak}</dt>
                  <dd className="mt-1.5 text-base font-medium tabular-nums">
                    <AnimatedNumber
                      value={Math.max(...snapshot.logins)}
                      language={language}
                      motionEnabled={motionEnabled}
                    />
                  </dd>
                </div>
              </dl>
            </div>
            <LoginChart range={range} language={language} motionEnabled={motionEnabled} />
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <Button
              className="dashboard-study-action rounded-full"
              onClick={() => openDetails('logins')}
            >
              {t.logins}
              <ArrowRight aria-hidden="true" />
            </Button>
            <span className="text-xs text-muted-foreground">{t.sample}</span>
          </div>
        </StudyCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StudyCard
            className="flex flex-col justify-between gap-5 p-5 sm:p-6"
            motionEnabled={motionEnabled}
            order={1}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t.members}</h2>
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="flex items-baseline gap-2">
                <span className="study-metric text-4xl font-medium sm:text-5xl">
                  <AnimatedNumber
                    value={snapshot.members}
                    language={language}
                    motionEnabled={motionEnabled}
                  />
                </span>
                <span className="text-xs text-muted-foreground">{t.people}</span>
              </div>
              <div className="flex -space-x-2" aria-hidden="true">
                {['Z', 'L', 'C'].map((initial) => (
                  <span
                    key={initial}
                    className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-xs font-medium text-muted-foreground"
                  >
                    {initial}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t.membersHint}</p>
          </StudyCard>
          <StudyCard
            className="flex flex-col justify-between gap-5 p-5 sm:p-6"
            motionEnabled={motionEnabled}
            order={2}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t.events}</h2>
              <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <span className="study-metric text-4xl font-medium sm:text-5xl">
              <AnimatedNumber
                value={snapshot.operations}
                language={language}
                motionEnabled={motionEnabled}
              />
            </span>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{t.eventsHint}</span>
              <ShieldCheck className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
            </div>
          </StudyCard>
        </div>
      </div>

      <div className="dashboard-study-bottom grid gap-4 md:grid-cols-2">
        <StudyCard className="p-5 sm:p-6" motionEnabled={motionEnabled} order={3}>
          <h2 className="font-semibold">{t.success}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.successHint}</p>
          <div className="my-3">
            <SuccessGauge rate={successRate} language={language} motionEnabled={motionEnabled} />
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 text-xs">
            <div>
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-brand" />
                {t.passed}
              </dt>
              <dd className="mt-1.5 text-lg font-medium tabular-nums">
                <AnimatedNumber
                  value={snapshot.operations - snapshot.failedOperations}
                  language={language}
                  motionEnabled={motionEnabled}
                />
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-destructive" />
                {t.failed}
              </dt>
              <dd className="mt-1.5 text-lg font-medium tabular-nums">
                <AnimatedNumber
                  value={snapshot.failedOperations}
                  language={language}
                  motionEnabled={motionEnabled}
                />
              </dd>
            </div>
          </dl>
        </StudyCard>

        <StudyCard
          className="dashboard-study-distribution flex flex-col p-5 sm:p-6"
          motionEnabled={motionEnabled}
          order={4}
        >
          <h2 className="font-semibold">{t.distribution}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.distributionHint}</p>
          <div className="mt-7 flex flex-1 flex-col justify-between gap-5">
            {snapshot.distribution.map((value, index) => (
              <div key={distributionLabels[index].en}>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span>{distributionLabels[index][language]}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatter.format(value)}{' '}
                    <span className="ml-1">{Math.round((value / snapshot.operations) * 100)}%</span>
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-secondary"
                  role="meter"
                  aria-label={distributionLabels[index][language]}
                  aria-valuemin={0}
                  aria-valuemax={snapshot.operations}
                  aria-valuenow={value}
                >
                  <DistributionBar
                    value={value}
                    total={snapshot.operations}
                    category={index}
                    motionEnabled={motionEnabled}
                  />
                </div>
              </div>
            ))}
          </div>
        </StudyCard>

        <StudyCard
          className="flex flex-col p-5 md:col-span-2 lg:col-span-1 sm:p-6"
          motionEnabled={motionEnabled}
          order={5}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t.recent}</h2>
            <span className="text-xs text-muted-foreground">{t.recentHint}</span>
          </div>
          <ul className="mt-3 flex-1 divide-y divide-border-subtle">
            {dashboardActivities.map((activity) => {
              const Icon =
                activity.kind === 'role'
                  ? ShieldCheck
                  : activity.kind === 'export'
                    ? FileDown
                    : LogIn
              return (
                <li key={activity.id}>
                  <button
                    type="button"
                    className="group flex w-full items-start gap-3 rounded-control px-2 py-4 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => openDetails(activity)}
                  >
                    <span
                      className="dashboard-study-activity-icon flex size-9 shrink-0 items-center justify-center rounded-control"
                      data-kind={activity.kind}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium">{activity.person[language]}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {activity.time}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground group-hover:text-foreground">
                        {activity.action[language]}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3 text-brand-text" aria-hidden="true" />
              {t.allRecorded}
            </span>
            {onOpenGraph && (
              <Button variant="ghost" size="xs" onClick={onOpenGraph}>
                {t.graph}
                <ArrowUpRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </StudyCard>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{details === 'logins' ? t.logins : t.activityDetails}</DialogTitle>
            <DialogDescription>
              {details === 'logins' ? t.logDescription : t.demoExplanation}
            </DialogDescription>
          </DialogHeader>
          {details === 'logins' ? (
            <div>
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{rangeLabels[range][language]}</span>
                <strong className="font-semibold tabular-nums">
                  {formatter.format(total)} {t.times}
                </strong>
              </div>
              <div className="max-h-72 overflow-auto rounded-control border border-border-subtle">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t.period}</th>
                      <th className="px-4 py-3 text-right font-medium">{t.count}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {snapshot.logins.map((value, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2.5">{loginBucketLabel(range, index, language)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatter.format(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border-subtle bg-secondary">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{t.total}</th>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatter.format(total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : details ? (
            <div className="flex flex-col gap-5">
              <p className="text-base font-medium">{details.action[language]}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {details.detail[language]}
              </p>
              <dl className="grid grid-cols-2 gap-5 rounded-panel bg-secondary p-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t.person}</dt>
                  <dd className="mt-1">{details.person[language]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.category}</dt>
                  <dd className="mt-1">{details.category[language]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.time}</dt>
                  <dd className="mt-1 flex items-center gap-1.5 tabular-nums">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {details.time}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.result}</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-success-foreground">
                    <CircleCheck className="size-3" aria-hidden="true" />
                    {t.completed}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t.close}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
