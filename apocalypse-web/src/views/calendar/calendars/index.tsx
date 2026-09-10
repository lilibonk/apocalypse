import { ModuleAccess } from '@/lib/query/ModuleAccess'
export { calendarScope as queryScope } from '../calendar.queries'
import { calendarScope, calendarQueries, calendarOperations } from '../calendar.queries'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
/**
 * 日历层级、日历属性与成员授权是一个相互约束的组合管理面，超出单表 DynaLayer，
 * 因而使用手写逃逸舱；所有写操作仍由后端 capability、permission 与范围角色复核。
 */

import { FieldSelect, FieldOption } from '@/components/ui/field-select'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePerm } from '@/hooks/usePerm'

import type { CalendarRecord, CalendarRole } from '../calendar.api'
import { CalendarPageFrame, DataEmpty, InlineError, StateBadge } from '../calendar.ui'
import { toErrorMessage } from '../calendar.format'
import { CalendarConfirm } from '../calendar-confirm'

type CalendarForm = {
  calendarKey: string
  name: string
  parentId: string
  regionCode: string
  zoneId: string
  state: 'ACTIVE' | 'ARCHIVED'
}

const EMPTY_FORM: CalendarForm = {
  calendarKey: '',
  name: '',
  parentId: '1',
  regionCode: 'CN',
  zoneId: 'Asia/Shanghai',
  state: 'ACTIVE',
}

function CalendarManagementPage() {
  const { t } = useTranslation('calendar')
  const queryClient = useQueryClient()
  const canReadMembers = usePerm('calendar:member:list')
  const [calendarSelection, setCalendarSelection] = useState('')
  const [editing, setEditing] = useState<CalendarRecord | 'new' | null>(null)
  const [form, setForm] = useState<CalendarForm>(EMPTY_FORM)
  const [memberOpen, setMemberOpen] = useState(false)
  const [memberUserId, setMemberUserId] = useState('')
  const [memberRole, setMemberRole] = useState<CalendarRole>('READER')

  const calendarsQuery = useQuery(calendarQueries.contexts({}))
  const selectedId = calendarsQuery.data?.some((calendar) => calendar.id === calendarSelection)
    ? calendarSelection
    : (calendarsQuery.data?.[0]?.id ?? '')
  const selected = calendarsQuery.data?.find((calendar) => calendar.id === selectedId) ?? null
  const canManageSelected = selected?.kind === 'MANAGED' && selected.currentUserRole === 'PUBLISHER'
  const membersQuery = useQuery(
    calendarQueries.members(
      { calendarId: selectedId, page: 1, size: 50 },
      canManageSelected && canReadMembers,
    ),
  )

  const onDenied = useCalendarDenial(selectedId, [calendarsQuery.error, membersQuery.error], () => {
    setCalendarSelection('')
    setEditing(null)
    setForm(EMPTY_FORM)
    setMemberOpen(false)
    setMemberUserId('')
    setMemberRole('READER')
  })

  const refresh = () => {
    void queryClient.invalidateQueries(calendarQueries.contexts.filter({}))
    if (selectedId)
      void queryClient.invalidateQueries(calendarQueries.members.filter({ calendarId: selectedId }))
  }
  const saveCalendarMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([selectedId, editing, form, memberOpen, memberUserId, memberRole]),
    mutationFn: (run) => {
      if (editing === 'new') {
        return run(calendarOperations.createCalendar, {
          calendarKey: form.calendarKey.trim(),
          name: form.name.trim(),
          parentId: form.parentId,
          regionCode: form.regionCode.trim(),
          zoneId: form.zoneId.trim(),
        })
      }
      if (!editing) throw new Error(t('calendars.selectionRequired'))
      return run(calendarOperations.updateCalendar, editing, {
        name: form.name.trim(),
        parentId: form.parentId,
        zoneId: form.zoneId.trim(),
        state: form.state,
      })
    },
    onSuccess: (calendar) => {
      toast.success(editing === 'new' ? t('calendars.created') : t('calendars.updated'))
      setEditing(null)
      setCalendarSelection(calendar.id)
      refresh()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      refresh()
    },
  })
  const archiveMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([selectedId, editing, form, memberOpen, memberUserId, memberRole]),
    mutationFn: (run, id: string) => run(calendarOperations.archiveCalendar, id),
    onSuccess: () => {
      toast.success(t('calendars.archived'))
      refresh()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      refresh()
    },
  })
  const saveMemberMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([selectedId, editing, form, memberOpen, memberUserId, memberRole]),
    mutationFn: (run) =>
      run(
        calendarOperations.saveMember,
        selectedId,
        memberUserId.trim(),
        memberRole,
        membersQuery.data?.list.find((member) => member.userId === memberUserId.trim())?.version ??
          0,
      ),
    onSuccess: () => {
      toast.success(t('calendars.memberSaved'))
      setMemberOpen(false)
      setMemberUserId('')
      void queryClient.invalidateQueries(calendarQueries.members.filter({ calendarId: selectedId }))
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      refresh()
    },
  })
  const removeMemberMutation = useModuleMutation(calendarScope, {
    onDenied,
    localKey: JSON.stringify([selectedId, editing, form, memberOpen, memberUserId, memberRole]),
    mutationFn: (run, userId: string) => run(calendarOperations.removeMember, selectedId, userId),
    onSuccess: () => {
      toast.success(t('calendars.memberRemoved'))
      void queryClient.invalidateQueries(calendarQueries.members.filter({ calendarId: selectedId }))
    },
    onError: (error) => {
      toast.error(toErrorMessage(error))
      refresh()
    },
  })

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, parentId: selectedId || '1' })
    setEditing('new')
  }
  const openEdit = (calendar: CalendarRecord) => {
    setForm({
      calendarKey: calendar.calendarKey,
      name: calendar.name,
      parentId: calendar.parentId ?? '1',
      regionCode: calendar.regionCode,
      zoneId: calendar.zoneId,
      state: calendar.state,
    })
    setEditing(calendar)
  }

  return (
    <CalendarPageFrame
      title={t('calendars.title')}
      description={t('calendars.description')}
      actions={
        <Perm perm="calendar:calendar:add">
          <Button onClick={openCreate}>
            <Plus />
            {t('calendars.add')}
          </Button>
        </Perm>
      }
    >
      {calendarsQuery.error && <InlineError message={toErrorMessage(calendarsQuery.error)} />}
      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="gap-4 py-4">
          <CardHeader className="px-4">
            <CardTitle>{t('calendars.contexts')}</CardTitle>
            <CardDescription>{t('calendars.contextsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4">
            {(calendarsQuery.data ?? []).map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                onClick={() => setCalendarSelection(calendar.id)}
                className="w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
                data-selected={selectedId === calendar.id}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{calendar.name}</span>
                  <Badge variant="outline">{t(`calendarKinds.${calendar.kind}`)}</Badge>
                </span>
                <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                  {calendar.calendarKey}
                </span>
              </button>
            ))}
            {!calendarsQuery.isLoading && (calendarsQuery.data ?? []).length === 0 && (
              <DataEmpty>{t('calendars.noVisible')}</DataEmpty>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {!selected ? (
            <DataEmpty>{t('calendars.choose')}</DataEmpty>
          ) : (
            <>
              <Card className="gap-4 py-4">
                <CardHeader className="px-4 sm:px-6">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <CardTitle>{selected.name}</CardTitle>
                      <CardDescription>{selected.calendarKey}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StateBadge value={selected.state} />
                      {selected.currentUserRole && (
                        <Badge>{t(`roles.${selected.currentUserRole}`)}</Badge>
                      )}
                      {canManageSelected && (
                        <>
                          <Perm perm="calendar:calendar:edit">
                            <Button variant="outline" size="sm" onClick={() => openEdit(selected)}>
                              <Pencil />
                              {t('calendars.edit')}
                            </Button>
                          </Perm>
                          <Perm perm="calendar:calendar:archive">
                            <CalendarConfirm
                              title={t('calendars.archive')}
                              description={t('calendars.archiveWarning')}
                              reviewKey={JSON.stringify([selected.id, selected.version])}
                              disabled={archiveMutation.isPending}
                              onConfirm={() => archiveMutation.mutate(selected.id)}
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    selected.state === 'ARCHIVED' || archiveMutation.isPending
                                  }
                                >
                                  <Archive />
                                  {t('calendars.archive')}
                                </Button>
                              }
                            >
                              <p>
                                {selected.name} · {selected.calendarKey}
                              </p>
                            </CalendarConfirm>
                          </Perm>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 px-4 text-sm sm:grid-cols-2 sm:px-6">
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">{t('calendars.regionZone')}</div>
                    <div className="mt-1 font-medium">
                      {selected.regionCode} · {selected.zoneId}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">{t('calendars.parentId')}</div>
                    <div className="mt-1 font-medium">
                      {calendarsQuery.data?.find((item) => item.id === selected.parentId)?.name ??
                        '—'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {canReadMembers && canManageSelected && (
                <Card className="gap-4 py-4">
                  <CardHeader className="px-4 sm:px-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{t('calendars.members')}</CardTitle>
                        <CardDescription>{t('calendars.membersDescription')}</CardDescription>
                      </div>
                      <Perm perm="calendar:member:edit">
                        <Button variant="outline" size="sm" onClick={() => setMemberOpen(true)}>
                          <UserPlus />
                          {t('calendars.addMember')}
                        </Button>
                      </Perm>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 sm:px-6">
                    {membersQuery.error && (
                      <InlineError message={toErrorMessage(membersQuery.error)} />
                    )}
                    {(membersQuery.data?.list ?? []).map((member) => (
                      <div
                        key={member.userId}
                        className="flex flex-col justify-between gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {member.nickname || member.username}
                          </div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {member.username} · {member.userId}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{t(`roles.${member.role}`)}</Badge>
                          <StateBadge value={member.state} />
                          <Perm perm="calendar:member:edit">
                            <CalendarConfirm
                              title={t('calendars.removeMember', { username: member.username })}
                              description={t('calendars.removeMemberWarning')}
                              reviewKey={JSON.stringify([
                                selectedId,
                                member.userId,
                                member.version,
                                member.role,
                              ])}
                              disabled={removeMemberMutation.isPending}
                              onConfirm={() => removeMemberMutation.mutate(member.userId)}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t('calendars.removeMember', {
                                    username: member.username,
                                  })}
                                  disabled={removeMemberMutation.isPending}
                                >
                                  <Trash2 className="text-destructive" />
                                </Button>
                              }
                            >
                              <p>
                                {selected.name} · {member.username} · {t(`roles.${member.role}`)}
                              </p>
                            </CalendarConfirm>
                          </Perm>
                        </div>
                      </div>
                    ))}
                    {!membersQuery.isLoading && (membersQuery.data?.list ?? []).length === 0 && (
                      <DataEmpty>{t('calendars.noMembers')}</DataEmpty>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? t('calendars.createTitle') : t('calendars.editTitle')}
            </DialogTitle>
            <DialogDescription>{t('calendars.formDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormInput
              id="calendar-key"
              label={t('calendars.calendarKey')}
              value={form.calendarKey}
              disabled={editing !== 'new'}
              onChange={(calendarKey) => setForm((value) => ({ ...value, calendarKey }))}
            />
            <FormInput
              id="calendar-name"
              label={t('calendars.name')}
              value={form.name}
              onChange={(name) => setForm((value) => ({ ...value, name }))}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="calendar-parent">{t('calendars.parent')}</Label>
              <FieldSelect
                id="calendar-parent"
                value={form.parentId}
                onValueChange={(selection) =>
                  setForm((value) => ({ ...value, parentId: selection }))
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {(calendarsQuery.data ?? [])
                  .filter((calendar) => calendar.id !== (editing === 'new' ? '' : editing?.id))
                  .map((calendar) => (
                    <FieldOption key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </FieldOption>
                  ))}
              </FieldSelect>
            </div>
            <FormInput
              id="calendar-region"
              label={t('calendars.regionCode')}
              value={form.regionCode}
              disabled={editing !== 'new'}
              onChange={(regionCode) => setForm((value) => ({ ...value, regionCode }))}
            />
            <FormInput
              id="calendar-zone"
              label={t('calendars.zoneId')}
              value={form.zoneId}
              onChange={(zoneId) => setForm((value) => ({ ...value, zoneId }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t('calendars.cancel')}
            </Button>
            <Button
              disabled={
                saveCalendarMutation.isPending ||
                !form.calendarKey.trim() ||
                !form.name.trim() ||
                !form.parentId
              }
              onClick={() => saveCalendarMutation.mutate()}
            >
              {t('calendars.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('calendars.addMemberTitle')}</DialogTitle>
            <DialogDescription>{t('calendars.addMemberDescription')}</DialogDescription>
          </DialogHeader>
          <FormInput
            id="calendar-member-user"
            label={t('calendars.userId')}
            value={memberUserId}
            onChange={setMemberUserId}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-member-role">{t('calendars.role')}</Label>
            <FieldSelect
              id="calendar-member-role"
              value={memberRole}
              onValueChange={(selection) => setMemberRole(selection as CalendarRole)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <FieldOption value="READER">{t('roles.READER')}</FieldOption>
              <FieldOption value="EDITOR">{t('roles.EDITOR')}</FieldOption>
              <FieldOption value="PUBLISHER">{t('roles.PUBLISHER')}</FieldOption>
            </FieldSelect>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberOpen(false)}>
              {t('calendars.cancel')}
            </Button>
            <Button
              disabled={!memberUserId.trim() || saveMemberMutation.isPending}
              onClick={() => saveMemberMutation.mutate()}
            >
              {t('calendars.saveGrant')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CalendarPageFrame>
  )
}

function FormInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export default function CalendarModulePage() {
  return <ModuleAccess scope={calendarScope} component={CalendarManagementPage} />
}
import { useCalendarDenial } from '../use-calendar-denial'
