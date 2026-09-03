/** 个人覆盖同时呈现生效来源、版本与冲突复核，属于非标准字段级工作台，手写实现。 */

import { DatePicker } from '@/components/ui/date-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

import {
  getDay,
  getPersonalOverride,
  listCalendars,
  listPersonalConflicts,
  resolvePersonalConflict,
  savePersonalOverride,
  type ConflictResolution,
  type OverrideConflict,
} from '../calendar.api'
import {
  CalendarPageFrame,
  CalendarPicker,
  DataEmpty,
  FieldPair,
  InlineError,
  StateBadge,
} from '../calendar.ui'
import { dayValueText, toErrorMessage } from '../calendar.format'
import { CalendarConfirm } from '../calendar-confirm'
import { DayOverrideEditor } from '../day-override-editor'
import {
  buildDayOverride,
  emptyOverrideInput,
  dayFieldLabels,
  underlayField,
  snapshotField,
} from '../day-override-model'
import { OverrideChangePreview } from '../override-change-preview'

function today(): string {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export default function PersonalOverridePage() {
  const { t } = useTranslation('calendar')
  const queryClient = useQueryClient()
  const [calendarSelection, setCalendarSelection] = useState('')
  const [date, setDate] = useState(today)
  const [input, setInput] = useState(emptyOverrideInput)
  const operation = buildDayOverride(input)
  const year = date.slice(0, 4)

  const calendarsQuery = useQuery({
    queryKey: ['calendar', 'contexts'],
    queryFn: listCalendars,
  })
  const calendarId = calendarsQuery.data?.some((calendar) => calendar.id === calendarSelection)
    ? calendarSelection
    : (calendarsQuery.data?.[0]?.id ?? '')
  const overrideQuery = useQuery({
    queryKey: ['calendar', 'personal-overrides', calendarId, year],
    queryFn: () => getPersonalOverride(calendarId, `${year}-01-01`, `${year}-12-31`),
    enabled: calendarId !== '',
  })
  const dayQuery = useQuery({
    queryKey: ['calendar', 'day', calendarId, date],
    queryFn: () => getDay(calendarId, date),
    enabled: calendarId !== '' && date !== '',
  })
  const conflictsQuery = useQuery({
    queryKey: ['calendar', 'personal-conflicts', calendarId],
    queryFn: () => listPersonalConflicts(calendarId),
    enabled: calendarId !== '',
  })

  const currentItem = useMemo(
    () =>
      overrideQuery.data?.items.find((item) => item.date === date && item.field === input.field) ??
      null,
    [date, input.field, overrideQuery.data],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['calendar', 'contexts'] })
    void queryClient.invalidateQueries({ queryKey: ['calendar', 'personal-overrides', calendarId] })
    void queryClient.invalidateQueries({ queryKey: ['calendar', 'personal-conflicts', calendarId] })
    void queryClient.invalidateQueries({ queryKey: ['calendar', 'day', calendarId] })
    void queryClient.invalidateQueries({ queryKey: ['calendar', 'days', calendarId] })
  }
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!operation) throw new Error(t('overrideEditor.invalid'))
      return savePersonalOverride(calendarId, date, overrideQuery.data?.revisionNo ?? 0, operation)
    },
    onSuccess: () => {
      toast.success(t('personalOverrides.saved'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })

  return (
    <CalendarPageFrame
      title={t('personalOverrides.title')}
      description={t('personalOverrides.description')}
      actions={
        <CalendarPicker
          calendars={calendarsQuery.data ?? []}
          value={calendarId}
          onChange={(value) => {
            setCalendarSelection(value)
            setInput(emptyOverrideInput())
          }}
        />
      }
    >
      {(overrideQuery.error || dayQuery.error || conflictsQuery.error) && (
        <InlineError
          message={toErrorMessage(overrideQuery.error ?? dayQuery.error ?? conflictsQuery.error)}
        />
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <Card className="gap-4 py-4">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>{t('personalOverrides.editLabel')}</CardTitle>
            <CardDescription>{t('personalOverrides.editDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6">
            <div className="grid gap-1.5">
              <Label htmlFor="personal-override-date">{t('personalOverrides.date')}</Label>
              <DatePicker
                id="personal-override-date"
                mode="date"
                allowClear={false}
                value={date}
                onValueChange={(selection) => setDate(selection)}
              />
            </div>
            <DayOverrideEditor value={input} onChange={setInput} />
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {t('personalOverrides.currentOverride')}
              </div>
              <div className="mt-1 font-medium">
                {currentItem
                  ? `${t(`overrideActions.${currentItem.action}`)} · ${dayValueText(currentItem.value)}`
                  : t('personalOverrides.noCurrentOverride')}
              </div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {t('personalOverrides.revision', {
                  number: overrideQuery.data?.revisionNo ?? 0,
                })}
              </div>
            </div>
            <Perm perm="calendar:personal-override:edit">
              <CalendarConfirm
                reviewKey={JSON.stringify([
                  calendarId,
                  date,
                  operation,
                  overrideQuery.data?.revisionNo,
                  dayQuery.data?.resolutions,
                ])}
                title={t('personalOverrides.saveRevision')}
                description={t('overrideEditor.personalWarning')}
                onConfirm={() => saveMutation.mutate()}
                disabled={
                  !operation ||
                  !dayQuery.data ||
                  saveMutation.isPending ||
                  !!dayQuery.error ||
                  overrideQuery.isFetching ||
                  dayQuery.isFetching ||
                  !!overrideQuery.error
                }
                trigger={
                  <Button
                    className="w-full"
                    disabled={
                      !calendarId ||
                      !date ||
                      !operation ||
                      !dayQuery.data ||
                      !!dayQuery.error ||
                      overrideQuery.isFetching ||
                      dayQuery.isFetching ||
                      !!overrideQuery.error ||
                      saveMutation.isPending
                    }
                  >
                    {input.action === 'INHERIT' ? <RotateCcw /> : <Save />}
                    {t('personalOverrides.saveRevision')}
                  </Button>
                }
              >
                {dayQuery.data && operation && (
                  <OverrideChangePreview
                    day={dayQuery.data}
                    operation={operation}
                    underlay={underlayField(dayQuery.data, input.field, 'PERSONAL')}
                    scope={t('overrideEditor.personalScope') + ' · ' + dayQuery.data.calendarKey}
                  />
                )}
              </CalendarConfirm>
            </Perm>
          </CardContent>
        </Card>

        <Tabs defaultValue="preview" className="min-w-0 gap-4">
          <TabsList>
            <TabsTrigger value="preview">{t('workspace.preview')}</TabsTrigger>
            <TabsTrigger value="review">{t('workspace.review')}</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <Card className="gap-4 py-4">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle>{t('personalOverrides.comparison', { date })}</CardTitle>
                <CardDescription>{t('personalOverrides.baselineDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 px-4 sm:px-6">
                {!dayQuery.data ? (
                  <DataEmpty>{t('personalOverrides.chooseDate')}</DataEmpty>
                ) : (
                  <>
                    {Object.entries(dayFieldLabels).map(([field, label]) => (
                      <FieldPair
                        key={field}
                        label={t(label)}
                        baseline={dayValueText(
                          snapshotField(
                            dayQuery.data!.baseline,
                            field as keyof typeof dayFieldLabels,
                          ),
                        )}
                        effective={dayValueText(
                          snapshotField(
                            dayQuery.data!.effective,
                            field as keyof typeof dayFieldLabels,
                            dayQuery.data!.resolutions.find((item) => item.field === field)?.state,
                          ),
                        )}
                      />
                    ))}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {dayQuery.data.resolutions.map((resolution) => (
                        <Badge key={resolution.field} variant="outline">
                          {t(dayFieldLabels[resolution.field])} ·{' '}
                          {t(`layers.${resolution.source.layer}`)}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="review" forceMount className="data-[state=inactive]:hidden">
            <Card className="gap-4 py-4">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle>{t('personalOverrides.conflicts')}</CardTitle>
                <CardDescription>{t('personalOverrides.conflictsDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 sm:px-6">
                {(conflictsQuery.data?.list ?? []).map((conflict) => (
                  <div key={conflict.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {conflict.date} · {t(dayFieldLabels[conflict.field])}
                      </div>
                      <StateBadge value={conflict.state} />
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-md bg-muted/40 p-2">
                        <div className="text-xs text-muted-foreground">
                          {t('personalOverrides.previousUnderlay')}
                        </div>
                        <div className="mt-1">{dayValueText(conflict.previousUnderlay)}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2">
                        <div className="text-xs text-muted-foreground">
                          {t('personalOverrides.currentUnderlay')}
                        </div>
                        <div className="mt-1">{dayValueText(conflict.currentUnderlay)}</div>
                      </div>
                    </div>
                    {conflict.state === 'OPEN' && (
                      <Perm perm="calendar:personal-override:edit">
                        <PersonalConflictActions
                          calendarId={calendarId}
                          conflict={conflict}
                          onResolved={invalidate}
                        />
                      </Perm>
                    )}
                  </div>
                ))}
                {!conflictsQuery.isLoading && (conflictsQuery.data?.list ?? []).length === 0 && (
                  <DataEmpty>{t('personalOverrides.noConflicts')}</DataEmpty>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CalendarPageFrame>
  )
}

/** Conflicts can belong to a different year than the date currently being edited. */
function PersonalConflictActions({
  calendarId,
  conflict,
  onResolved,
}: {
  calendarId: string
  conflict: OverrideConflict
  onResolved: () => void
}) {
  const { t } = useTranslation('calendar')
  const year = conflict.date.slice(0, 4)
  const revision = useQuery({
    queryKey: ['calendar', 'personal-overrides', calendarId, year],
    queryFn: () => getPersonalOverride(calendarId, `${year}-01-01`, `${year}-12-31`),
  })
  const current = revision.data?.items.find((item) => item.id === conflict.overrideItemId)
  const resolve = useMutation({
    mutationFn: (resolution: ConflictResolution) =>
      resolvePersonalConflict(calendarId, conflict.id, resolution, revision.data!.revisionNo),
    onSuccess: () => {
      toast.success(t('personalOverrides.conflictResolved'))
      onResolved()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      onResolved()
    },
  })
  const disabled = !current || revision.isFetching || !!revision.error || resolve.isPending
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {revision.error && <InlineError message={toErrorMessage(revision.error)} />}
      {(['KEEP', 'REBASE', 'INHERIT'] as const).map((resolution) => (
        <CalendarConfirm
          key={resolution}
          reviewKey={JSON.stringify([
            calendarId,
            conflict.id,
            conflict.currentHash,
            revision.data?.revisionNo,
            current,
          ])}
          title={t(`conflictResolutions.${resolution}`)}
          description={t(`overrideEditor.${resolution}`)}
          disabled={disabled}
          onConfirm={() => resolve.mutate(resolution)}
          trigger={
            <Button
              size="sm"
              variant={resolution === 'KEEP' ? 'default' : 'outline'}
              disabled={disabled}
            >
              {t(`conflictResolutions.${resolution}`)}
            </Button>
          }
        >
          <p>
            {conflict.date} · {t(dayFieldLabels[conflict.field])} ·{' '}
            {t('overrideEditor.personalScope')}
          </p>
          <p>
            {t('personalOverrides.previousUnderlay')}: {dayValueText(conflict.previousUnderlay)}
          </p>
          <p>
            {t('personalOverrides.currentUnderlay')}: {dayValueText(conflict.currentUnderlay)}
          </p>
          <p>
            {t('overrideEditor.currentOverride')}:{' '}
            {current && t(`overrideActions.${current.action}`)} · {dayValueText(current?.value)}
          </p>
          <p>{t('personalOverrides.revision', { number: revision.data?.revisionNo })}</p>
        </CalendarConfirm>
      ))}
    </div>
  )
}
