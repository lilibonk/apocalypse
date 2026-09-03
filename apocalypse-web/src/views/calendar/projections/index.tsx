/** 投影授权是来源系统 × 目标日历的范围能力管理，使用专用列表与幂等模式说明。 */

import { FieldSelect, FieldOption } from '@/components/ui/field-select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  listCalendars,
  listProjectionGrants,
  removeProjectionGrant,
  saveProjectionGrant,
  type ProjectionGrant,
} from '../calendar.api'
import {
  CalendarPageFrame,
  CalendarPicker,
  DataEmpty,
  InlineError,
  StateBadge,
} from '../calendar.ui'
import { toErrorMessage } from '../calendar.format'
import { CalendarConfirm } from '../calendar-confirm'

export default function ProjectionGrantPage() {
  const { t } = useTranslation('calendar')
  const queryClient = useQueryClient()
  const [calendarSelection, setCalendarSelection] = useState('')
  const [sourceSystem, setSourceSystem] = useState('')
  const [publishMode, setPublishMode] = useState<ProjectionGrant['publishMode']>('DRAFT_ONLY')

  const calendarsQuery = useQuery({
    queryKey: ['calendar', 'contexts'],
    queryFn: listCalendars,
  })
  const publisherCalendars = useMemo(
    () =>
      (calendarsQuery.data ?? []).filter(
        (calendar) => calendar.kind === 'MANAGED' && calendar.currentUserRole === 'PUBLISHER',
      ),
    [calendarsQuery.data],
  )
  const calendarId = publisherCalendars.some((calendar) => calendar.id === calendarSelection)
    ? calendarSelection
    : (publisherCalendars[0]?.id ?? '')
  const grantsQuery = useQuery({
    queryKey: ['calendar', 'projection-grants', calendarId],
    queryFn: () => listProjectionGrants(calendarId),
    enabled: calendarId !== '',
  })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['calendar', 'contexts'] })
    void queryClient.invalidateQueries({ queryKey: ['calendar', 'projection-grants', calendarId] })
  }
  const saveMutation = useMutation({
    mutationFn: ({
      source,
      mode,
      expectedVersion,
    }: {
      source: string
      mode: ProjectionGrant['publishMode']
      expectedVersion: number
    }) => saveProjectionGrant(calendarId, source, mode, expectedVersion),
    onSuccess: () => {
      toast.success(t('projections.saved'))
      setSourceSystem('')
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })
  const removeMutation = useMutation({
    mutationFn: (source: string) => removeProjectionGrant(calendarId, source),
    onSuccess: () => {
      toast.success(t('projections.disabled'))
      invalidate()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      invalidate()
    },
  })

  return (
    <CalendarPageFrame
      title={t('projections.title')}
      description={t('projections.description')}
      actions={
        <CalendarPicker
          calendars={publisherCalendars}
          value={calendarId}
          onChange={setCalendarSelection}
          roles={['PUBLISHER']}
        />
      }
    >
      {grantsQuery.error && <InlineError message={toErrorMessage(grantsQuery.error)} />}
      {publisherCalendars.length === 0 && !calendarsQuery.isLoading ? (
        <DataEmpty>{t('projections.noRole')}</DataEmpty>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <Card className="gap-4 py-4">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle>{t('projections.addSource')}</CardTitle>
              <CardDescription>{t('projections.addSourceDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <div className="grid gap-1.5">
                <Label htmlFor="projection-source">{t('projections.sourceSystem')}</Label>
                <Input
                  id="projection-source"
                  value={sourceSystem}
                  maxLength={64}
                  placeholder={t('projections.sourcePlaceholder')}
                  onChange={(event) => setSourceSystem(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('projections.sourceHint')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="projection-mode">{t('projections.publishMode')}</Label>
                <FieldSelect
                  id="projection-mode"
                  value={publishMode}
                  onValueChange={(selection) =>
                    setPublishMode(selection as ProjectionGrant['publishMode'])
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <FieldOption value="DRAFT_ONLY">{t('publishModes.DRAFT_ONLY')}</FieldOption>
                  <FieldOption value="DIRECT_PUBLISH">
                    {t('publishModes.DIRECT_PUBLISH')}
                  </FieldOption>
                </FieldSelect>
              </div>
              <Perm perm="calendar:projection-grant:edit">
                <Button
                  className="w-full"
                  disabled={
                    !calendarId ||
                    !/^[A-Za-z0-9._-]{1,64}$/.test(sourceSystem) ||
                    saveMutation.isPending
                  }
                  onClick={() =>
                    saveMutation.mutate({
                      source: sourceSystem,
                      mode: publishMode,
                      expectedVersion: 0,
                    })
                  }
                >
                  <Plus />
                  {t('projections.save')}
                </Button>
              </Perm>
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle>{t('projections.configured')}</CardTitle>
              <CardDescription>{t('projections.configuredDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 sm:px-6">
              {(grantsQuery.data ?? []).map((grant) => (
                <div
                  key={grant.sourceSystem}
                  className="flex flex-col justify-between gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{grant.sourceSystem}</span>
                      <StateBadge value={grant.state} />
                      <Badge variant="outline">v{grant.version}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t(`publishModes.${grant.publishMode}`)}
                    </div>
                  </div>
                  <Perm perm="calendar:projection-grant:edit">
                    <div className="flex flex-wrap gap-2">
                      <CalendarConfirm
                        title={t('projections.switchMode')}
                        description={t('projections.switchWarning')}
                        reviewKey={JSON.stringify([calendarId, grant])}
                        disabled={saveMutation.isPending}
                        onConfirm={() =>
                          saveMutation.mutate({
                            source: grant.sourceSystem,
                            mode:
                              grant.publishMode === 'DRAFT_ONLY' ? 'DIRECT_PUBLISH' : 'DRAFT_ONLY',
                            expectedVersion: grant.version,
                          })
                        }
                        trigger={
                          <Button variant="outline" size="sm" disabled={saveMutation.isPending}>
                            {t('projections.switchMode')}
                          </Button>
                        }
                      >
                        <p>
                          {grant.sourceSystem} · {t(`publishModes.${grant.publishMode}`)} →{' '}
                          {t(
                            `publishModes.${grant.publishMode === 'DRAFT_ONLY' ? 'DIRECT_PUBLISH' : 'DRAFT_ONLY'}`,
                          )}
                        </p>
                      </CalendarConfirm>
                      <CalendarConfirm
                        title={t('projections.disable')}
                        description={t('projections.disableWarning')}
                        reviewKey={JSON.stringify([calendarId, grant])}
                        disabled={removeMutation.isPending}
                        onConfirm={() => removeMutation.mutate(grant.sourceSystem)}
                        trigger={
                          <Button variant="ghost" size="sm" disabled={removeMutation.isPending}>
                            <Trash2 className="text-destructive" />
                            {t('projections.disable')}
                          </Button>
                        }
                      >
                        <p>
                          {grant.sourceSystem} · {t(`publishModes.${grant.publishMode}`)}
                        </p>
                      </CalendarConfirm>
                    </div>
                  </Perm>
                </div>
              ))}
              {!grantsQuery.isLoading && (grantsQuery.data ?? []).length === 0 && (
                <DataEmpty>{t('projections.empty')}</DataEmpty>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </CalendarPageFrame>
  )
}
