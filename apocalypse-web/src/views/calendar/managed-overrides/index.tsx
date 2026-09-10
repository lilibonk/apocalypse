import { ModuleAccess } from '@/lib/query/ModuleAccess'
export { calendarScope as queryScope } from '../calendar.queries'
import {
  calendarScope,
  calendarQueries,
  calendarOperations,
  calendarFilters,
} from '../calendar.queries'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
/** 托管覆盖包含草稿、不可变修订、逐项冲突决策与发布 Gate，使用手写状态机工作台。 */

import { FieldSelect, FieldOption } from '@/components/ui/field-select'
import { DatePicker } from '@/components/ui/date-picker'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Save, Send, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

import type { ConflictResolution } from '../calendar.api'
import {
  CalendarPageFrame,
  CalendarTrace,
  CalendarPicker,
  DataEmpty,
  InlineError,
  StateBadge,
} from '../calendar.ui'
import { dayValueText, toErrorMessage } from '../calendar.format'
import { CalendarConfirm } from '../calendar-confirm'
import { DayOverrideEditor } from '../day-override-editor'
import {
  buildDayOverride,
  emptyOverrideInput,
  underlayField,
  dayFieldLabels,
} from '../day-override-model'
import { OverrideChangePreview } from '../override-change-preview'
import { OverrideRevisionDiff } from '../override-revision-diff'

function today(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function ManagedOverridePage() {
  const { t } = useTranslation('calendar')
  const queryClient = useQueryClient()
  const [calendarSelection, setCalendarSelection] = useState('')
  const [date, setDate] = useState(today)
  const [input, setInput] = useState(emptyOverrideInput)
  const operation = buildDayOverride(input)
  const [decisions, setDecisions] = useState<Record<string, ConflictResolution | ''>>({})

  const calendarsQuery = useQuery(calendarQueries.contexts({}))
  const managedCalendars = useMemo(
    () =>
      (calendarsQuery.data ?? []).filter(
        (calendar) =>
          calendar.kind === 'MANAGED' &&
          (calendar.currentUserRole === 'EDITOR' || calendar.currentUserRole === 'PUBLISHER'),
      ),
    [calendarsQuery.data],
  )
  const calendarId = managedCalendars.some((calendar) => calendar.id === calendarSelection)
    ? calendarSelection
    : (managedCalendars[0]?.id ?? '')
  const draftQuery = useQuery(
    calendarQueries.managedDraft({ calendarId: calendarId }, calendarId !== ''),
  )
  const revisionsQuery = useQuery(
    calendarQueries.managedRevisions({ calendarId: calendarId }, calendarId !== ''),
  )
  const conflictsQuery = useQuery(
    calendarQueries.managedConflicts({ calendarId: calendarId }, calendarId !== ''),
  )

  const dayQuery = useQuery(
    calendarQueries.day(
      { calendarId: calendarId, date: date, includePersonal: false },
      calendarId !== '' && date !== '',
    ),
  )

  const onDenied = useCalendarDenial(
    calendarId,
    [
      calendarsQuery.error,
      draftQuery.error,
      revisionsQuery.error,
      conflictsQuery.error,
      dayQuery.error,
    ],
    () => {
      setCalendarSelection('')
      setInput(emptyOverrideInput())
      setDecisions({})
    },
  )

  const published = revisionsQuery.data?.list.find((revision) => revision.state === 'PUBLISHED')
  const expectedRevisionNo = draftQuery.data?.revisionNo ?? published?.revisionNo ?? 0
  const canPublish =
    managedCalendars.find((calendar) => calendar.id === calendarId)?.currentUserRole === 'PUBLISHER'
  const openConflicts = (conflictsQuery.data?.list ?? []).filter(
    (conflict) => conflict.state === 'OPEN',
  )
  const decisionsComplete = openConflicts.every((conflict) => decisions[conflict.id])

  const invalidate = () => {
    void queryClient.invalidateQueries(calendarQueries.contexts.filter({}))
    void queryClient.invalidateQueries(calendarFilters.managedOverrides({ calendarId: calendarId }))
    void queryClient.invalidateQueries(
      calendarQueries.managedConflicts.filter({ calendarId: calendarId }),
    )
    void queryClient.invalidateQueries(calendarQueries.day.filter({ calendarId: calendarId }))
    void queryClient.invalidateQueries(calendarQueries.days.filter({ calendarId: calendarId }))
  }
  const saveMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([calendarId, date, input, decisions]),
    mutationFn: (run) => {
      if (!operation) throw new Error(t('overrideEditor.invalid'))
      return run(
        calendarOperations.saveManagedOverride,
        calendarId,
        date,
        expectedRevisionNo,
        operation,
      )
    },
    onSuccess: () => {
      toast.success(t('managedOverrides.saved'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })
  const discardMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([calendarId, date, input, decisions]),
    mutationFn: (run) => run(calendarOperations.discardManagedDraft, calendarId),
    onSuccess: () => {
      toast.success(t('managedOverrides.discarded'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })
  const publishMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([calendarId, date, input, decisions]),
    mutationFn: (run) => {
      const draft = draftQuery.data
      if (!draft) throw new Error(t('managedOverrides.noDraft'))
      return run(
        calendarOperations.publishManagedOverride,
        calendarId,
        draft,
        openConflicts.map((conflict) => ({
          conflictId: conflict.id,
          resolution: decisions[conflict.id] as ConflictResolution,
        })),
      )
    },
    onSuccess: () => {
      toast.success(t('managedOverrides.published'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })
  const withdrawMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([calendarId, date, input, decisions]),
    mutationFn: (run, revisionId: string) =>
      run(calendarOperations.withdrawManagedOverride, calendarId, revisionId),
    onSuccess: () => {
      toast.success(t('managedOverrides.withdrawn'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })

  return (
    <CalendarPageFrame
      title={t('managedOverrides.title')}
      description={t('managedOverrides.description')}
      actions={
        <CalendarPicker
          calendars={managedCalendars}
          value={calendarId}
          onChange={(value) => {
            setCalendarSelection(value)
            setDecisions({})
            setInput(emptyOverrideInput())
          }}
          roles={['EDITOR', 'PUBLISHER']}
        />
      }
    >
      {(draftQuery.error || revisionsQuery.error || conflictsQuery.error) && (
        <InlineError
          message={toErrorMessage(draftQuery.error ?? revisionsQuery.error ?? conflictsQuery.error)}
        />
      )}
      {managedCalendars.length === 0 && !calendarsQuery.isLoading ? (
        <DataEmpty>{t('managedOverrides.noRole')}</DataEmpty>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <div className="space-y-5">
            <Card className="gap-4 py-4">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle>{t('managedOverrides.draft')}</CardTitle>
                <CardDescription>{t('managedOverrides.draftDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 sm:px-6">
                <div className="grid gap-1.5">
                  <Label htmlFor="managed-override-date">{t('managedOverrides.date')}</Label>
                  <DatePicker
                    id="managed-override-date"
                    mode="date"
                    allowClear={false}
                    value={date}
                    onValueChange={(selection) => setDate(selection)}
                  />
                </div>
                <DayOverrideEditor value={input} onChange={setInput} />
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('managedOverrides.targetRevision')}</span>
                    <span className="font-mono">#{expectedRevisionNo || 1}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span>{t('managedOverrides.currentDraft')}</span>
                    {draftQuery.data ? (
                      <StateBadge value={draftQuery.data.state} />
                    ) : (
                      <span className="text-muted-foreground">
                        {t('managedOverrides.notCreated')}
                      </span>
                    )}
                  </div>
                </div>
                <Perm perm="calendar:managed-override:edit">
                  <div className="grid grid-cols-2 gap-2">
                    <CalendarConfirm
                      reviewKey={JSON.stringify([
                        calendarId,
                        date,
                        operation,
                        draftQuery.data?.contentHash,
                        expectedRevisionNo,
                        dayQuery.data?.resolutions,
                      ])}
                      title={t('managedOverrides.saveDraft')}
                      description={t('overrideEditor.managedWarning')}
                      onConfirm={() => saveMutation.mutate()}
                      disabled={
                        !operation || !dayQuery.data || !!dayQuery.error || saveMutation.isPending
                      }
                      trigger={
                        <Button
                          disabled={
                            !calendarId ||
                            !operation ||
                            !dayQuery.data ||
                            !!dayQuery.error ||
                            saveMutation.isPending
                          }
                        >
                          {input.action === 'INHERIT' ? <RotateCcw /> : <Save />}
                          {t('managedOverrides.saveDraft')}
                        </Button>
                      }
                    >
                      {dayQuery.data && operation && (
                        <OverrideChangePreview
                          day={dayQuery.data}
                          operation={operation}
                          underlay={underlayField(dayQuery.data, input.field, 'MANAGED')}
                          scope={
                            t('overrideEditor.managedScope') + ' · ' + dayQuery.data.calendarKey
                          }
                        />
                      )}
                    </CalendarConfirm>
                    <CalendarConfirm
                      reviewKey={JSON.stringify([
                        calendarId,
                        draftQuery.data?.version,
                        draftQuery.data?.contentHash,
                      ])}
                      title={t('managedOverrides.discardDraft')}
                      description={t('overrideEditor.discardWarning')}
                      onConfirm={() => discardMutation.mutate()}
                      trigger={
                        <Button
                          variant="outline"
                          disabled={!draftQuery.data || discardMutation.isPending}
                        >
                          <Trash2 />
                          {t('managedOverrides.discardDraft')}
                        </Button>
                      }
                    />
                  </div>
                </Perm>
              </CardContent>
            </Card>

            <Card className="gap-4 py-4">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle>{t('managedOverrides.publishGate')}</CardTitle>
                <CardDescription>{t('managedOverrides.publishGateDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 sm:px-6">
                <CalendarTrace>
                  <div className="text-xs text-muted-foreground">
                    {t('managedOverrides.contentHash')}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs">
                    {draftQuery.data?.contentHash ?? '—'}
                  </div>
                </CalendarTrace>
                {canPublish && (
                  <Perm perm="calendar:managed-override:publish">
                    <CalendarConfirm
                      reviewKey={JSON.stringify([
                        calendarId,
                        draftQuery.data?.version,
                        draftQuery.data?.contentHash,
                        decisions,
                        openConflicts,
                      ])}
                      title={t('managedOverrides.publishRevision')}
                      description={t('overrideEditor.publishWarning')}
                      onConfirm={() => publishMutation.mutate()}
                      disabled={!draftQuery.data || !decisionsComplete || publishMutation.isPending}
                      trigger={
                        <Button
                          className="w-full"
                          disabled={
                            !draftQuery.data || !decisionsComplete || publishMutation.isPending
                          }
                        >
                          <Send />
                          {t('managedOverrides.publishRevision')}
                        </Button>
                      }
                    >
                      <p>
                        {managedCalendars.find((item) => item.id === calendarId)?.name} · #
                        {draftQuery.data?.revisionNo}
                      </p>
                      <OverrideRevisionDiff
                        before={published?.items ?? []}
                        after={draftQuery.data?.items ?? []}
                      />
                      {openConflicts.map((conflict) => (
                        <div key={conflict.id} className="rounded-md border p-2">
                          <p>
                            {conflict.date} · {t(dayFieldLabels[conflict.field])} ·{' '}
                            {t(`conflictResolutions.${decisions[conflict.id]}`)}
                          </p>
                          <p>
                            {dayValueText(conflict.previousUnderlay)} →{' '}
                            {dayValueText(conflict.currentUnderlay)}
                          </p>
                          <p>{t(`overrideEditor.${decisions[conflict.id]}`)}</p>
                        </div>
                      ))}
                    </CalendarConfirm>
                  </Perm>
                )}
                {!decisionsComplete && (
                  <p role="status" className="text-xs text-destructive">
                    {t('managedOverrides.decisionsRequired')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="review" className="min-w-0 gap-4">
            <TabsList>
              <TabsTrigger value="review">{t('workspace.review')}</TabsTrigger>
              <TabsTrigger value="history">{t('workspace.history')}</TabsTrigger>
            </TabsList>
            <TabsContent value="review">
              <Card className="gap-4 py-4">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>{t('managedOverrides.conflicts')}</CardTitle>
                  <CardDescription>{t('managedOverrides.conflictsDescription')}</CardDescription>
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
                            {t('managedOverrides.previousUnderlay')}
                          </div>
                          <div className="mt-1">{dayValueText(conflict.previousUnderlay)}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <div className="text-xs text-muted-foreground">
                            {t('managedOverrides.currentUnderlay')}
                          </div>
                          <div className="mt-1">{dayValueText(conflict.currentUnderlay)}</div>
                        </div>
                      </div>
                      {conflict.state === 'OPEN' && (
                        <div className="mt-3 grid gap-1.5">
                          <Label htmlFor={`managed-conflict-${conflict.id}`}>
                            {t('managedOverrides.publishDecision')}
                          </Label>
                          <FieldSelect
                            id={`managed-conflict-${conflict.id}`}
                            value={decisions[conflict.id] ?? ''}
                            onValueChange={(selection) =>
                              setDecisions((value) => ({
                                ...value,
                                [conflict.id]: selection as ConflictResolution,
                              }))
                            }
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <FieldOption value="">
                              {t('managedOverrides.selectDecision')}
                            </FieldOption>
                            <FieldOption value="KEEP">{t('conflictResolutions.KEEP')}</FieldOption>
                            <FieldOption value="REBASE">
                              {t('conflictResolutions.REBASE')}
                            </FieldOption>
                            <FieldOption value="INHERIT">
                              {t('conflictResolutions.INHERIT')}
                            </FieldOption>
                          </FieldSelect>
                        </div>
                      )}
                    </div>
                  ))}
                  {!conflictsQuery.isLoading && (conflictsQuery.data?.list ?? []).length === 0 && (
                    <DataEmpty>{t('managedOverrides.noConflicts')}</DataEmpty>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history" forceMount className="data-[state=inactive]:hidden">
              <Card className="gap-4 py-4">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>{t('managedOverrides.history')}</CardTitle>
                  <CardDescription>{t('managedOverrides.historyDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 px-4 sm:px-6">
                  {(revisionsQuery.data?.list ?? []).map((revision) => (
                    <div
                      key={revision.id}
                      className="flex flex-col justify-between gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {t('managedOverrides.revision', { number: revision.revisionNo })}
                          </span>
                          <StateBadge value={revision.state} />
                          <Badge variant="outline">
                            {t('managedOverrides.itemCount', { count: revision.items.length })}
                          </Badge>
                        </div>
                        <div className="mt-1 max-w-xl truncate font-mono text-xs text-muted-foreground">
                          {revision.contentHash}
                        </div>
                      </div>
                      {revision.state === 'PUBLISHED' && canPublish && (
                        <Perm perm="calendar:managed-override:publish">
                          <CalendarConfirm
                            reviewKey={JSON.stringify([
                              calendarId,
                              revision.id,
                              revision.state,
                              revision.version,
                            ])}
                            title={t('managedOverrides.withdraw')}
                            description={t('overrideEditor.withdrawWarning')}
                            onConfirm={() => withdrawMutation.mutate(revision.id)}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={withdrawMutation.isPending}
                              >
                                <Undo2 />
                                {t('managedOverrides.withdraw')}
                              </Button>
                            }
                          >
                            <p>
                              #{revision.revisionNo} · {revision.contentHash}
                            </p>
                          </CalendarConfirm>
                        </Perm>
                      )}
                    </div>
                  ))}
                  {!revisionsQuery.isLoading && (revisionsQuery.data?.list ?? []).length === 0 && (
                    <DataEmpty>{t('managedOverrides.noRevisions')}</DataEmpty>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </CalendarPageFrame>
  )
}

export default function CalendarModulePage() {
  return <ModuleAccess scope={calendarScope} component={ManagedOverridePage} />
}
import { useCalendarDenial } from '../use-calendar-denial'
