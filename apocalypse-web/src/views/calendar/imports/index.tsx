import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileCheck2, RefreshCw, Send, ShieldCheck, Upload, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Perm } from '@/components/Perm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import {
  downloadDataImportFile,
  downloadDataImportTemplate,
  getDataImportDiff,
  listCalendars,
  listDataImports,
  publishDataImport,
  rejectDataImport,
  reviewDataImport,
  uploadDataImport,
  validateDataImport,
  type DataImportRecord,
  type DataImportTarget,
} from '../calendar.api'
import { CalendarPageFrame, DataEmpty, InlineError, StateBadge } from '../calendar.ui'
import { toErrorMessage } from '../calendar.format'

const IMPORTS_KEY = ['calendar', 'data-imports'] as const

function nextYear(): number {
  return new Date().getFullYear() + 1
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

export default function DataImportPage() {
  const { t } = useTranslation('calendar')
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [targetType, setTargetType] = useState<DataImportTarget>('MANAGED_OVERRIDE')
  const [calendarId, setCalendarId] = useState('')
  const [year, setYear] = useState(nextYear)
  const [importKey, setImportKey] = useState('')
  const [sourceClaim, setSourceClaim] = useState<DataImportRecord['sourceClaim']>('LOCAL_POLICY')
  const [assuranceLevel, setAssuranceLevel] =
    useState<DataImportRecord['assuranceLevel']>('UNVERIFIED')
  const [documentNo, setDocumentNo] = useState('')
  const [documentTitle, setDocumentTitle] = useState('')
  const [issuer, setIssuer] = useState('')
  const [documentPublishedOn, setDocumentPublishedOn] = useState('')
  const [sourceUri, setSourceUri] = useState('')
  const [dataFile, setDataFile] = useState<File | null>(null)
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [sourceAttested, setSourceAttested] = useState(false)

  const calendarsQuery = useQuery({ queryKey: ['calendar', 'contexts'], queryFn: listCalendars })
  const importsQuery = useQuery({ queryKey: IMPORTS_KEY, queryFn: () => listDataImports(1, 100) })
  const managedCalendars = useMemo(
    () =>
      (calendarsQuery.data ?? []).filter(
        (calendar) =>
          calendar.kind === 'MANAGED' &&
          (calendar.currentUserRole === 'EDITOR' || calendar.currentUserRole === 'PUBLISHER'),
      ),
    [calendarsQuery.data],
  )
  const selected = importsQuery.data?.list.find((value) => value.id === selectedId) ?? null
  const canReviewSelected =
    selected?.targetType === 'SYSTEM_BASELINE' ||
    managedCalendars.find((calendar) => calendar.id === selected?.targetCalendarId)
      ?.currentUserRole === 'PUBLISHER'
  const systemSourceReady =
    targetType !== 'SYSTEM_BASELINE' ||
    (assuranceLevel !== 'UNVERIFIED' &&
      documentNo.trim().length > 0 &&
      documentTitle.trim().length > 0 &&
      issuer.trim().length > 0 &&
      documentPublishedOn.length > 0)
  const diffQuery = useQuery({
    queryKey: ['calendar', 'data-imports', selected?.id, 'diff'],
    queryFn: () => getDataImportDiff(selected!.id),
    enabled: selected != null && ['VALIDATED', 'REVIEWED', 'PUBLISHED'].includes(selected.state),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: IMPORTS_KEY })
    if (selectedId)
      void queryClient.invalidateQueries({
        queryKey: ['calendar', 'data-imports', selectedId, 'diff'],
      })
  }
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!dataFile) throw new Error(t('imports.dataFileRequired'))
      if (targetType === 'MANAGED_OVERRIDE' && !calendarId)
        throw new Error(t('imports.calendarRequired'))
      if (!systemSourceReady) throw new Error(t('imports.officialSourceRequired'))
      return uploadDataImport(
        {
          importKey: importKey.trim(),
          targetType,
          targetCalendarId: targetType === 'MANAGED_OVERRIDE' ? calendarId : undefined,
          regionCode: 'CN',
          dataYear: year,
          sourceClaim,
          assuranceLevel,
          documentNo: documentNo.trim() || undefined,
          documentTitle: documentTitle.trim() || undefined,
          issuer: issuer.trim() || undefined,
          documentPublishedOn: documentPublishedOn || undefined,
          sourceUri: sourceUri.trim() || undefined,
        },
        dataFile,
        evidenceFile ?? undefined,
      )
    },
    onSuccess: (value) => {
      toast.success(t('imports.uploaded'))
      setSelectedId(value.id)
      setDataFile(null)
      setEvidenceFile(null)
      refresh()
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })
  const validateMutation = useMutation({
    mutationFn: (id: string) => validateDataImport(id),
    onSuccess: (value) => {
      toast.success(value.state === 'VALIDATED' ? t('imports.validated') : t('imports.invalid'))
      refresh()
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })
  const reviewMutation = useMutation({
    mutationFn: () => reviewDataImport(selected!, reviewNote.trim()),
    onSuccess: () => {
      toast.success(t('imports.reviewed'))
      setSourceAttested(false)
      refresh()
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })
  const publishMutation = useMutation({
    mutationFn: () => publishDataImport(selected!, diffQuery.data!),
    onSuccess: () => {
      toast.success(t('imports.published'))
      refresh()
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'days'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'day'] })
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })
  const rejectMutation = useMutation({
    mutationFn: () => rejectDataImport(selected!, reviewNote.trim()),
    onSuccess: () => {
      toast.success(t('imports.rejected'))
      refresh()
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })
  const templateMutation = useMutation({
    mutationFn: () => downloadDataImportTemplate(targetType, year),
    onSuccess: (blob) => saveBlob(blob, `calendar-${targetType.toLowerCase()}-${year}.csv`),
    onError: (error) => toast.error(toErrorMessage(error)),
  })
  const fileMutation = useMutation({
    mutationFn: async ({
      value,
      type,
    }: {
      value: DataImportRecord
      type: 'data' | 'evidence'
    }) => ({
      blob: await downloadDataImportFile(value.id, type),
      fileName: type === 'data' ? value.dataFile.fileName : value.evidenceFile!.fileName,
    }),
    onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
    onError: (error) => toast.error(toErrorMessage(error)),
  })

  const setTarget = (value: DataImportTarget) => {
    setTargetType(value)
    if (value === 'SYSTEM_BASELINE') {
      setSourceClaim('OFFICIAL_NOTICE')
      setAssuranceLevel('OFFLINE_DOCUMENT_REVIEWED')
    } else {
      setSourceClaim('LOCAL_POLICY')
      setAssuranceLevel('UNVERIFIED')
    }
  }

  return (
    <CalendarPageFrame
      title={t('imports.title')}
      description={t('imports.description')}
      actions={
        <Button
          variant="outline"
          disabled={templateMutation.isPending}
          onClick={() => templateMutation.mutate()}
        >
          <Download />
          {t('imports.downloadTemplate')}
        </Button>
      }
    >
      {(importsQuery.error || calendarsQuery.error) && (
        <InlineError message={toErrorMessage(importsQuery.error ?? calendarsQuery.error)} />
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(21rem,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <Card className="gap-4 py-4">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle>{t('imports.newImport')}</CardTitle>
              <CardDescription>{t('imports.offlineHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <div className="grid gap-1.5">
                <Label htmlFor="import-target">{t('imports.target')}</Label>
                <select
                  id="import-target"
                  value={targetType}
                  onChange={(event) => setTarget(event.target.value as DataImportTarget)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="MANAGED_OVERRIDE">MANAGED · {t('imports.managed')}</option>
                  <option value="SYSTEM_BASELINE">SYSTEM · {t('imports.system')}</option>
                </select>
              </div>
              {targetType === 'MANAGED_OVERRIDE' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="import-calendar">{t('businessCalendar')}</Label>
                  <select
                    id="import-calendar"
                    value={calendarId}
                    onChange={(event) => setCalendarId(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t('selectCalendar')}</option>
                    {managedCalendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.name} · {calendar.currentUserRole}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="import-key">{t('imports.importKey')}</Label>
                  <Input
                    id="import-key"
                    value={importKey}
                    maxLength={64}
                    placeholder={`calendar-${year}-r1`}
                    onChange={(event) => setImportKey(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="import-year">{t('imports.year')}</Label>
                  <Input
                    id="import-year"
                    type="number"
                    min={1901}
                    max={2100}
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="import-source">{t('imports.sourceClaim')}</Label>
                  <select
                    id="import-source"
                    value={sourceClaim}
                    disabled={targetType === 'SYSTEM_BASELINE'}
                    onChange={(event) =>
                      setSourceClaim(event.target.value as DataImportRecord['sourceClaim'])
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                  >
                    <option value="LOCAL_POLICY">LOCAL_POLICY</option>
                    <option value="OFFICIAL_NOTICE">OFFICIAL_NOTICE</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="import-assurance">{t('imports.assurance')}</Label>
                  <select
                    id="import-assurance"
                    value={assuranceLevel}
                    onChange={(event) =>
                      setAssuranceLevel(event.target.value as DataImportRecord['assuranceLevel'])
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="UNVERIFIED">UNVERIFIED</option>
                    <option value="OFFLINE_DOCUMENT_REVIEWED">OFFLINE_DOCUMENT_REVIEWED</option>
                    <option value="ONLINE_VERIFIED">ONLINE_VERIFIED</option>
                  </select>
                </div>
              </div>
              {sourceClaim === 'OFFICIAL_NOTICE' && (
                <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2">
                  <Input
                    value={documentNo}
                    required={targetType === 'SYSTEM_BASELINE'}
                    placeholder={t('imports.documentNo')}
                    onChange={(event) => setDocumentNo(event.target.value)}
                  />
                  <Input
                    value={issuer}
                    required={targetType === 'SYSTEM_BASELINE'}
                    placeholder={t('imports.issuer')}
                    onChange={(event) => setIssuer(event.target.value)}
                  />
                  <Input
                    className="sm:col-span-2"
                    value={documentTitle}
                    required={targetType === 'SYSTEM_BASELINE'}
                    placeholder={t('imports.documentTitle')}
                    onChange={(event) => setDocumentTitle(event.target.value)}
                  />
                  <Input
                    type="date"
                    value={documentPublishedOn}
                    required={targetType === 'SYSTEM_BASELINE'}
                    aria-label={t('imports.publishedOn')}
                    onChange={(event) => setDocumentPublishedOn(event.target.value)}
                  />
                  <Input
                    value={sourceUri}
                    placeholder={t('imports.sourceUri')}
                    onChange={(event) => setSourceUri(event.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="import-data-file">{t('imports.dataFile')}</Label>
                <Input
                  id="import-data-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setDataFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">{t('imports.csvLimit')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="import-evidence-file">{t('imports.evidenceFile')}</Label>
                <Input
                  id="import-evidence-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.csv"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">{t('imports.evidenceLimit')}</p>
              </div>
              <Perm perm="calendar:data-import:upload">
                <Button
                  className="w-full"
                  disabled={
                    !importKey.trim() || !dataFile || !systemSourceReady || uploadMutation.isPending
                  }
                  onClick={() => uploadMutation.mutate()}
                >
                  <Upload />
                  {t('imports.upload')}
                </Button>
              </Perm>
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle>{t('imports.history')}</CardTitle>
              <CardDescription>{t('imports.historyHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 px-4 sm:px-6">
              {(importsQuery.data?.list ?? []).map((value) => (
                <button
                  key={value.id}
                  type="button"
                  data-selected={selectedId === value.id}
                  onClick={() => setSelectedId(value.id)}
                  className="w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/40 data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{value.importKey}</span>
                    <StateBadge value={value.state} />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {value.dataYear} · {value.targetType}
                  </span>
                </button>
              ))}
              {!importsQuery.isLoading && (importsQuery.data?.list ?? []).length === 0 && (
                <DataEmpty>{t('imports.noImports')}</DataEmpty>
              )}
            </CardContent>
          </Card>
        </div>

        {!selected ? (
          <DataEmpty>{t('imports.selectImport')}</DataEmpty>
        ) : (
          <div className="space-y-5">
            <Card className="gap-4 py-4">
              <CardHeader className="px-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selected.importKey}</CardTitle>
                    <CardDescription>
                      {selected.targetType} · {selected.regionCode} · {selected.dataYear}
                    </CardDescription>
                  </div>
                  <StateBadge value={selected.state} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-4 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FileSummary
                    label={t('imports.dataFile')}
                    file={selected.dataFile}
                    onDownload={() => fileMutation.mutate({ value: selected, type: 'data' })}
                  />
                  {selected.evidenceFile ? (
                    <FileSummary
                      label={t('imports.evidenceFile')}
                      file={selected.evidenceFile}
                      onDownload={() => fileMutation.mutate({ value: selected, type: 'evidence' })}
                    />
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                      {t('imports.noEvidence')}
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">{t('imports.normalizedHash')}</div>
                  <div className="mt-1 break-all font-mono text-xs">
                    {selected.normalizedPayloadHash ?? '—'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Perm perm="calendar:data-import:upload">
                    <Button
                      disabled={selected.state !== 'UPLOADED' || validateMutation.isPending}
                      onClick={() => validateMutation.mutate(selected.id)}
                    >
                      <FileCheck2 />
                      {t('imports.validate')}
                    </Button>
                  </Perm>
                  <Button variant="outline" onClick={refresh}>
                    <RefreshCw />
                    {t('imports.refresh')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {selected.validation && (
              <Card className="gap-4 py-4">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>{t('imports.validation')}</CardTitle>
                  <CardDescription>
                    {selected.validation.validatorVersion} · {selected.validation.rowCount}{' '}
                    {t('imports.rows')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 px-4 sm:px-6">
                  {selected.validation.valid ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <ShieldCheck className="size-4" />
                      {t('imports.validationPassed')}
                    </div>
                  ) : (
                    selected.validation.issues.map((issue, index) => (
                      <InlineError
                        key={`${issue.rowNumber}-${issue.column}-${index}`}
                        message={`${t('imports.row')} ${issue.rowNumber || '—'} · ${issue.column || 'CSV'} · ${issue.message}`}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {(diffQuery.data || diffQuery.error) && (
              <Card className="gap-4 py-4">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>{t('imports.diff')}</CardTitle>
                  <CardDescription>{t('imports.diffHint')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-4 sm:px-6">
                  {diffQuery.error && <InlineError message={toErrorMessage(diffQuery.error)} />}
                  {diffQuery.data && <DiffPanel value={diffQuery.data} />}
                </CardContent>
              </Card>
            )}

            {canReviewSelected && ['VALIDATED', 'REVIEWED'].includes(selected.state) && (
              <Card className="gap-4 py-4">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>{t('imports.reviewGate')}</CardTitle>
                  <CardDescription>{t('imports.reviewHint')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-4 sm:px-6">
                  <Textarea
                    value={reviewNote}
                    maxLength={500}
                    placeholder={t('imports.reviewNote')}
                    onChange={(event) => setReviewNote(event.target.value)}
                  />
                  {selected.state === 'VALIDATED' && (
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={sourceAttested}
                        onChange={(event) => setSourceAttested(event.target.checked)}
                      />
                      <span>{t('imports.attestation')}</span>
                    </label>
                  )}
                  <Perm perm="calendar:data-import:publish">
                    <div className="flex flex-wrap gap-2">
                      {selected.state === 'VALIDATED' && (
                        <Button
                          disabled={!sourceAttested || reviewMutation.isPending}
                          onClick={() => reviewMutation.mutate()}
                        >
                          <ShieldCheck />
                          {t('imports.review')}
                        </Button>
                      )}
                      {selected.state === 'REVIEWED' && (
                        <Button
                          disabled={!diffQuery.data || publishMutation.isPending}
                          onClick={() => publishMutation.mutate()}
                        >
                          <Send />
                          {t('imports.publish')}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate()}
                      >
                        <XCircle />
                        {t('imports.reject')}
                      </Button>
                    </div>
                  </Perm>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </CalendarPageFrame>
  )
}

function FileSummary({
  label,
  file,
  onDownload,
}: {
  label: string
  file: DataImportRecord['dataFile']
  onDownload: () => void
}) {
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 truncate font-medium">{file.fileName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)}</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onDownload} aria-label={label}>
          <Download />
        </Button>
      </div>
      <div className="mt-2 break-all font-mono text-[0.68rem] text-muted-foreground">
        {file.sha256}
      </div>
    </div>
  )
}

function DiffPanel({ value }: { value: NonNullable<DataImportRecord['diff']> }) {
  const { t } = useTranslation('calendar')
  const summaries = [
    ['ADDED', value.added],
    ['MODIFIED', value.modified],
    ['INHERITED', value.inherited],
    ['UNCHANGED', value.unchanged],
    ['CONFLICTS', value.conflicts],
  ] as const
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {summaries.map(([label, count]) => (
          <div key={label} className="rounded-md border border-border p-2 text-center">
            <div className="text-lg font-semibold">{count}</div>
            <div className="text-[0.68rem] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="max-h-96 overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="sticky top-0 bg-muted/90 text-xs text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2">{t('imports.date')}</th>
              <th className="px-3 py-2">{t('imports.change')}</th>
              <th className="px-3 py-2">{t('imports.oldValue')}</th>
              <th className="px-3 py-2">{t('imports.newValue')}</th>
            </tr>
          </thead>
          <tbody>
            {value.items.map((item) => (
              <tr key={item.date} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{item.date}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline">{item.changeType}</Badge>
                </td>
                <td className="px-3 py-2">
                  {item.oldClassification ?? item.oldAction ?? '—'} {item.oldName ?? ''}
                </td>
                <td className="px-3 py-2">
                  {item.newClassification ?? item.newAction} {item.newName ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="break-all font-mono text-[0.68rem] text-muted-foreground">
        target: {value.targetContentHash}
      </div>
    </>
  )
}
