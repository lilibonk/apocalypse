import './file-workspace.css'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DynaSearch, DynaTable, type DynaColumn, type DynaSearchField } from '@/components/dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { EntityPeekLink } from '@/components/navigation'
import { Perm } from '@/components/Perm'
import { ResponsiveInspector } from '@/components/spatial'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldOption, FieldSelect } from '@/components/ui/field-select'
import { FileUpload, type UploadedFileResult } from '@/components/ui/file-upload'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toastApiError } from '@/lib/api/error-toast'
import { copyTextToClipboard } from '@/lib/clipboard'
import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

import {
  deleteSystemFile,
  deleteSystemFilesBatch,
  downloadSystemFile,
  formatByteSize,
  getFileQuota,
  pageSystemFiles,
  triggerBlobDownload,
  uploadSystemFile,
  type SystemFilePageQuery,
  type SystemFileRow,
} from './file.api'

const ACCEPTED_FILE_TYPES =
  'image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,application/json,.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.json'

const CATEGORY_OPTIONS = [
  { value: 'general', labelKey: 'fileManage.catGeneral' },
  { value: 'avatar', labelKey: 'fileManage.catAvatar' },
  { value: 'attachment', labelKey: 'fileManage.catAttachment' },
  { value: 'document', labelKey: 'fileManage.catDocument' },
] as const

const CONTENT_TYPE_OPTIONS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/webp', label: 'WEBP' },
  { value: 'application/pdf', labelKey: 'fileManage.typePdf' },
  { value: 'text/csv', labelKey: 'fileManage.typeCsv' },
  { value: 'application/json', labelKey: 'fileManage.typeJson' },
  { value: 'text/plain', labelKey: 'fileManage.typeText' },
] as const

function quotaBarClass(ratio: number): string {
  if (ratio >= 0.9) return 'bg-destructive'
  if (ratio >= 0.75) return 'bg-warning'
  return 'bg-primary'
}

function contentTypeBadgeLabel(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return 'PNG'
    case 'image/jpeg':
      return 'JPEG'
    case 'image/webp':
      return 'WEBP'
    case 'application/pdf':
      return 'PDF'
    case 'text/csv':
      return 'CSV'
    case 'application/json':
      return 'JSON'
    case 'text/plain':
      return 'TXT'
    default:
      return contentType
  }
}

export default function FilePage() {
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  return <FilePageContent key={JSON.stringify([sessionEpoch, authorizationEpoch])} />
}

function FilePageContent() {
  const { t } = useTranslation('system')
  const queryClient = useQueryClient()
  const perms = useAuthStore((state) => state.perms)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)

  const canList = perms.includes('system:file:list')
  const canUpload = perms.includes('system:file:upload')
  const canRemove = perms.includes('system:file:remove')

  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({
    keyword: '',
    category: '',
    contentType: '',
  })
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({
    keyword: '',
    category: '',
    contentType: '',
  })
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('general')
  const [uploadRemark, setUploadRemark] = useState('')
  const [uploadedValue, setUploadedValue] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<SystemFileRow | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const appliedQuery = useMemo<SystemFilePageQuery>(
    () => ({
      page,
      size,
      keyword: appliedSearch.keyword,
      category: appliedSearch.category,
      contentType: appliedSearch.contentType,
    }),
    [appliedSearch.category, appliedSearch.contentType, appliedSearch.keyword, page, size],
  )

  const quotaQuery = useQuery({
    queryKey: ['system', 'files', 'quota', authorizationEpoch],
    queryFn: ({ signal }) => getFileQuota(signal),
    enabled: canList || canUpload,
  })

  const filesQuery = useQuery({
    queryKey: ['system', 'files', 'page', appliedQuery, authorizationEpoch],
    queryFn: ({ signal }) => pageSystemFiles(appliedQuery, signal),
    enabled: canList,
  })

  useResourceDenial({
    errors: [quotaQuery.error, filesQuery.error],
    clear: { queryKey: ['system', 'files'] },
    reset: () => {
      setSelectedId(null)
      setSelectedKeys([])
      setDeleteTarget(null)
      setBatchDeleteOpen(false)
      setUploadOpen(false)
    },
  })

  const quota = quotaQuery.data
  const records = useMemo(() => filesQuery.data?.list ?? [], [filesQuery.data?.list])
  const total = filesQuery.data?.total ?? 0

  const selectedFile = useMemo(
    () => records.find((row) => row.id === selectedId) ?? records[0] ?? null,
    [records, selectedId],
  )
  const activeRowKey = selectedFile?.id ?? null

  useEffect(() => {
    if (!copiedField) return
    const timer = window.setTimeout(() => setCopiedField(null), 1500)
    return () => window.clearTimeout(timer)
  }, [copiedField])

  const refreshFiles = async () => {
    await queryClient.invalidateQueries({ queryKey: ['system', 'files'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSystemFile(id),
    onSuccess: async () => {
      const removedId = deleteTarget?.id
      setDeleteTarget(null)
      if (removedId) {
        setSelectedKeys((prev) => prev.filter((item) => item !== removedId))
        if (selectedId === removedId) {
          setSelectedId(null)
        }
      }
      toast.success(t('fileManage.deleteSuccess'))
      await refreshFiles()
    },
    onError: (error) => {
      toastApiError(error, t('fileManage.delete'))
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteSystemFilesBatch(ids),
    onSuccess: async (_result, ids) => {
      setBatchDeleteOpen(false)
      setSelectedKeys([])
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null)
      }
      toast.success(t('fileManage.batchDeleteSuccess', { count: ids.length }))
      await refreshFiles()
    },
    onError: (error) => {
      toastApiError(error, t('fileManage.delete'))
    },
  })

  const categoryLabel = (value: string): string => {
    const matched = CATEGORY_OPTIONS.find((item) => item.value === value)
    return matched ? t(matched.labelKey) : value
  }

  const handleDownload = async (row: SystemFileRow) => {
    setDownloadingId(row.id)
    try {
      const blob = await downloadSystemFile(row.id)
      triggerBlobDownload(blob, row.originalFilename)
    } catch (error) {
      toastApiError(error, t('fileManage.downloadFailed'))
    } finally {
      setDownloadingId(null)
    }
  }

  const handleCopy = async (field: string, value: string) => {
    const ok = await copyTextToClipboard(value)
    if (ok) {
      setCopiedField(field)
      toast.success(t('fileManage.copied'))
    } else {
      toast.error(t('fileManage.copyFailed'))
    }
  }

  const handleUploadComplete = (value: string, meta?: UploadedFileResult) => {
    setUploadedValue(value)
    if (!value) return
    const displayName = meta?.originalFilename ?? value
    toast.success(t('fileManage.uploadSuccess', { name: displayName }))
    setUploadOpen(false)
    setUploadRemark('')
    setUploadedValue('')
    setPage(1)
    void refreshFiles()
  }

  const searchFields = useMemo<DynaSearchField[]>(
    () => [
      {
        name: 'keyword',
        label: t('fileManage.keyword'),
        type: 'input',
        placeholder: t('fileManage.keywordPlaceholder'),
      },
      {
        name: 'category',
        label: t('fileManage.category'),
        type: 'select',
        placeholder: t('fileManage.allCategories'),
        options: [
          { value: '', label: t('fileManage.allCategories') },
          ...CATEGORY_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelKey) })),
        ],
      },
      {
        name: 'contentType',
        label: t('fileManage.contentType'),
        type: 'select',
        placeholder: t('fileManage.allTypes'),
        options: [
          { value: '', label: t('fileManage.allTypes') },
          ...CONTENT_TYPE_OPTIONS.map((item) => ({
            value: item.value,
            label: 'labelKey' in item ? t(item.labelKey) : item.label,
          })),
        ],
      },
    ],
    [t],
  )

  const columns = useMemo<DynaColumn[]>(
    () => [
      {
        key: 'originalFilename',
        title: t('fileManage.fileName'),
        render: (_val, row) => {
          const item = row as unknown as SystemFileRow
          return (
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate font-medium text-foreground">{item.originalFilename}</span>
              <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
                {contentTypeBadgeLabel(item.contentType)}
              </Badge>
            </div>
          )
        },
      },
      {
        key: 'category',
        title: t('fileManage.category'),
        render: (val) => {
          const category = String(val ?? 'general')
          const matched = CATEGORY_OPTIONS.find((item) => item.value === category)
          return (
            <Badge variant="secondary" className="font-normal">
              {matched ? t(matched.labelKey) : category}
            </Badge>
          )
        },
      },
      {
        key: 'size',
        title: t('fileManage.size'),
        render: (val) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatByteSize(Number(val ?? 0))}
          </span>
        ),
      },
      {
        key: 'ownerUsername',
        title: t('fileManage.owner'),
        render: (_val, row) => {
          const item = row as unknown as SystemFileRow
          return <EntityPeekLink kind="user" id={item.ownerId} label={item.ownerUsername} />
        },
      },
      {
        key: 'createTime',
        title: t('fileManage.createdAt'),
        type: 'datetime',
      },
    ],
    [t],
  )

  const tableRows = useMemo(() => records.map((row) => ({ ...row })), [records])
  const filtered = Boolean(
    appliedSearch.keyword || appliedSearch.category || appliedSearch.contentType,
  )
  const maxFileSizeMb = Math.max(
    1,
    Math.floor((quota?.maxFileSizeBytes ?? 10 * 1024 * 1024) / (1024 * 1024)),
  )

  const userRatio =
    quota && quota.userQuotaBytes > 0 ? Math.min(1, quota.usedUserBytes / quota.userQuotaBytes) : 0
  const totalRatio =
    quota && quota.totalQuotaBytes > 0
      ? Math.min(1, quota.usedTotalBytes / quota.totalQuotaBytes)
      : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('fileManage.title')}
        description={t('fileManage.readOnlyHint')}
        actions={
          <>
            <Perm perm="system:file:upload">
              <Button
                type="button"
                onClick={() => {
                  setUploadedValue('')
                  setUploadOpen(true)
                }}
              >
                <Upload className="size-4" aria-hidden="true" />
                <span>{t('fileManage.upload')}</span>
              </Button>
            </Perm>
            {selectedFile && canList && (
              <Button
                type="button"
                variant="outline"
                className="file-workspace-compact-trigger"
                onClick={() => setInspectorOpen(true)}
              >
                <Eye className="size-4" aria-hidden="true" />
                <span>{t('fileManage.openDetails')}</span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={filesQuery.isFetching || quotaQuery.isFetching}
              onClick={() => void refreshFiles()}
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  (filesQuery.isFetching || quotaQuery.isFetching) && 'animate-spin',
                )}
                aria-hidden="true"
              />
              <span>{t('fileManage.refresh')}</span>
            </Button>
          </>
        }
      />

      {quota && (
        <section
          aria-label={t('fileManage.quotaPersonal')}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="rounded-panel border border-border-subtle bg-card p-3.5 shadow-surface">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="size-3.5" aria-hidden="true" />
                {t('fileManage.quotaPersonal')}
              </span>
              <span className="font-mono tabular-nums">
                {formatByteSize(quota.usedUserBytes)} / {formatByteSize(quota.userQuotaBytes)}
              </span>
            </div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', quotaBarClass(userRatio))}
                style={{ width: `${Math.round(userRatio * 100)}%` }}
              />
            </div>
          </div>

          {canList && (
            <div className="rounded-panel border border-border-subtle bg-card p-3.5 shadow-surface">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <HardDrive className="size-3.5" aria-hidden="true" />
                  {t('fileManage.quotaGlobal')}
                </span>
                <span className="font-mono tabular-nums">
                  {formatByteSize(quota.usedTotalBytes)} / {formatByteSize(quota.totalQuotaBytes)}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', quotaBarClass(totalRatio))}
                  style={{ width: `${Math.round(totalRatio * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="rounded-panel border border-border-subtle bg-card p-3.5 shadow-surface">
            <div className="text-xs text-muted-foreground">{t('fileManage.quotaMaxSingle')}</div>
            <div className="mt-1.5 font-mono text-lg font-semibold text-foreground tabular-nums">
              {formatByteSize(quota.maxFileSizeBytes)}
            </div>
          </div>

          {canList && (
            <div className="rounded-panel border border-border-subtle bg-card p-3.5 shadow-surface">
              <div className="text-xs text-muted-foreground">{t('fileManage.quotaFiles')}</div>
              <div className="mt-1.5 font-mono text-lg font-semibold text-foreground tabular-nums">
                {quota.activeFileCount}
              </div>
            </div>
          )}
        </section>
      )}

      {canList && (
        <>
          <DynaSearch
            fields={searchFields}
            values={draftSearch}
            appliedValues={appliedSearch}
            onChange={(name, value) => setDraftSearch((prev) => ({ ...prev, [name]: value }))}
            onSearch={() => {
              setAppliedSearch({ ...draftSearch })
              setPage(1)
              setSelectedKeys([])
            }}
            onReset={() => {
              const empty = { keyword: '', category: '', contentType: '' }
              setDraftSearch(empty)
              setAppliedSearch(empty)
              setPage(1)
              setSelectedKeys([])
            }}
          />

          {canRemove && selectedKeys.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border-subtle bg-card px-4 py-2.5 shadow-surface">
              <span className="text-sm text-foreground">
                {t('fileManage.batchDelete', { count: selectedKeys.length })}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedKeys([])}>
                  {t('fileManage.clearSelection')}
                </Button>
                <Perm perm="system:file:remove">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={batchDeleteMutation.isPending}
                    onClick={() => setBatchDeleteOpen(true)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    <span>{t('fileManage.batchDelete', { count: selectedKeys.length })}</span>
                  </Button>
                </Perm>
              </div>
            </div>
          )}

          <div className="file-workspace-layout">
            <DynaTable
              columns={columns}
              rows={tableRows}
              loading={filesQuery.isLoading}
              error={filesQuery.error}
              refreshing={filesQuery.isFetching}
              onRetry={() => void filesQuery.refetch()}
              filtered={filtered}
              onResetFilters={() => {
                const empty = { keyword: '', category: '', contentType: '' }
                setDraftSearch(empty)
                setAppliedSearch(empty)
                setPage(1)
              }}
              emptyText={t('fileManage.empty')}
              rowKey="id"
              page={page}
              size={size}
              total={total}
              onPageChange={(nextPage) => setPage(nextPage)}
              onPageSizeChange={(nextSize) => {
                setSize(nextSize)
                setPage(1)
              }}
              selectable={canRemove}
              selectedKeys={selectedKeys}
              onSelectedKeysChange={setSelectedKeys}
              activeRowKey={activeRowKey}
              onRowClick={(_row, key) => {
                setSelectedId(key)
                setInspectorOpen(true)
              }}
              actions={(rawRow) => {
                const row = rawRow as unknown as SystemFileRow
                return (
                  <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={downloadingId === row.id}
                      aria-label={`${t('fileManage.download')}: ${row.originalFilename}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDownload(row)
                      }}
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      <span>{t('fileManage.download')}</span>
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-label={`${t('fileManage.inspect')}: ${row.originalFilename}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedId(row.id)
                        setInspectorOpen(true)
                      }}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      <span>{t('fileManage.inspect')}</span>
                    </Button>
                    <Perm perm="system:file:remove">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        aria-label={`${t('fileManage.delete')}: ${row.originalFilename}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeleteTarget(row)
                        }}
                      >
                        <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                      </Button>
                    </Perm>
                  </div>
                )
              }}
            />

            <ResponsiveInspector
              mode="auto"
              title={t('fileManage.inspectorTitle')}
              context={selectedFile?.originalFilename}
              open={inspectorOpen}
              onOpenChange={setInspectorOpen}
            >
              {selectedFile ? (
                <div className="space-y-4 text-sm">
                  <div className="space-y-1">
                    <div className="font-medium break-all text-foreground">
                      {selectedFile.originalFilename}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {selectedFile.contentType}
                      </Badge>
                      <Badge variant="secondary">{categoryLabel(selectedFile.category)}</Badge>
                    </div>
                  </div>

                  <dl className="space-y-3 border-t border-border-subtle pt-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t('fileManage.size')}</dt>
                      <dd className="font-mono text-foreground tabular-nums">
                        {formatByteSize(selectedFile.size)} ({selectedFile.size} B)
                      </dd>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{t('fileManage.storageKey')}</dt>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => void handleCopy('key', selectedFile.key)}
                        >
                          {copiedField === 'key' ? (
                            <Check className="size-3 text-success" aria-hidden="true" />
                          ) : (
                            <Copy className="size-3" aria-hidden="true" />
                          )}
                          <span>
                            {copiedField === 'key' ? t('fileManage.copied') : t('fileManage.copy')}
                          </span>
                        </Button>
                      </div>
                      <dd className="rounded-control bg-muted px-2 py-1 font-mono text-[11px] break-all text-foreground">
                        {selectedFile.key}
                      </dd>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{t('fileManage.sha256')}</dt>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => void handleCopy('sha256', selectedFile.sha256)}
                        >
                          {copiedField === 'sha256' ? (
                            <Check className="size-3 text-success" aria-hidden="true" />
                          ) : (
                            <Copy className="size-3" aria-hidden="true" />
                          )}
                          <span>
                            {copiedField === 'sha256'
                              ? t('fileManage.copied')
                              : t('fileManage.copy')}
                          </span>
                        </Button>
                      </div>
                      <dd className="rounded-control bg-muted px-2 py-1 font-mono text-[11px] break-all text-foreground">
                        {selectedFile.sha256}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t('fileManage.owner')}</dt>
                      <dd>
                        <EntityPeekLink
                          kind="user"
                          id={selectedFile.ownerId}
                          label={selectedFile.ownerUsername}
                        />
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t('fileManage.deptId')}</dt>
                      <dd className="font-mono text-foreground">
                        {selectedFile.deptId ?? t('fileManage.noDepartment')}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t('fileManage.createdAt')}</dt>
                      <dd className="font-mono text-foreground tabular-nums">
                        {selectedFile.createTime.replace('T', ' ').slice(0, 19)}
                      </dd>
                    </div>

                    <div className="space-y-1">
                      <dt className="text-muted-foreground">{t('fileManage.remark')}</dt>
                      <dd className="rounded-control bg-muted/60 px-2.5 py-1.5 text-foreground">
                        {selectedFile.remark || t('fileManage.emptyRemark')}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={downloadingId === selectedFile.id}
                      onClick={() => void handleDownload(selectedFile)}
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      <span>{t('fileManage.download')}</span>
                    </Button>
                    <Perm perm="system:file:remove">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteTarget(selectedFile)}
                      >
                        <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                        <span>{t('fileManage.delete')}</span>
                      </Button>
                    </Perm>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                  <FolderOpen className="size-8 opacity-60" aria-hidden="true" />
                  <p>{t('fileManage.selectRowHint')}</p>
                </div>
              )}
            </ResponsiveInspector>
          </div>
        </>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('fileManage.uploadTitle')}</DialogTitle>
            <DialogDescription>{t('fileManage.uploadDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="file-upload-category">{t('fileManage.category')}</Label>
              <FieldSelect
                id="file-upload-category"
                value={uploadCategory}
                onValueChange={setUploadCategory}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <FieldOption key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </FieldOption>
                ))}
              </FieldSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="file-upload-remark">{t('fileManage.remark')}</Label>
              <Input
                id="file-upload-remark"
                maxLength={255}
                value={uploadRemark}
                onChange={(event) => setUploadRemark(event.target.value)}
                placeholder={t('fileManage.remarkPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('fileManage.chooseFile')}</Label>
              <FileUpload
                value={uploadedValue}
                onValueChange={handleUploadComplete}
                accept={ACCEPTED_FILE_TYPES}
                maxSizeMb={maxFileSizeMb}
                uploadFn={(file, onProgress, signal) =>
                  uploadSystemFile(
                    file,
                    { category: uploadCategory, remark: uploadRemark },
                    onProgress,
                    signal,
                  )
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
              {t('fileManage.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fileManage.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('fileManage.deleteHint', { name: deleteTarget?.originalFilename ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('fileManage.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault()
                if (!deleteTarget) return
                deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {t('fileManage.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={batchDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !batchDeleteMutation.isPending) {
            setBatchDeleteOpen(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fileManage.batchDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('fileManage.batchDeleteHint', { count: selectedKeys.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleteMutation.isPending}>
              {t('fileManage.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={batchDeleteMutation.isPending || selectedKeys.length === 0}
              onClick={(event) => {
                event.preventDefault()
                batchDeleteMutation.mutate(selectedKeys)
              }}
            >
              {t('fileManage.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
