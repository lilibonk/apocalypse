import type { UploadedFileResult } from '@/components/ui/file-upload'
import { http, rawRequest, request } from '@/lib/api/client'
import type { PageResult, SnowflakeId } from '@/lib/api/types'

export interface SystemFileRow {
  id: SnowflakeId
  key: string
  category: string
  originalFilename: string
  contentType: string
  size: number
  sha256: string
  ownerId: SnowflakeId
  ownerUsername: string
  deptId: SnowflakeId | null
  remark: string | null
  createTime: string
}

export interface FileQuotaSummary {
  usedUserBytes: number
  userQuotaBytes: number
  usedTotalBytes: number
  totalQuotaBytes: number
  maxFileSizeBytes: number
  activeFileCount: number
}

export interface SystemFilePageQuery {
  page: number
  size: number
  keyword?: string
  category?: string
  contentType?: string
}

export function pageSystemFiles(
  query: SystemFilePageQuery,
  signal?: AbortSignal,
): Promise<PageResult<SystemFileRow>> {
  return request<PageResult<SystemFileRow>>('/system/files/page', {
    query: {
      page: query.page,
      size: query.size,
      keyword: query.keyword?.trim() || undefined,
      category: query.category || undefined,
      contentType: query.contentType || undefined,
    },
    signal,
  })
}

export function getFileQuota(signal?: AbortSignal): Promise<FileQuotaSummary> {
  return request<FileQuotaSummary>('/system/files/quota', { signal })
}

export function uploadSystemFile(
  file: File,
  params: { category: string; remark?: string },
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFileResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', params.category || 'general')
  if (params.remark?.trim()) {
    formData.append('remark', params.remark.trim())
  }
  return http.post('/system/files/upload', formData, {
    signal,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    },
  }) as unknown as Promise<UploadedFileResult>
}

export function downloadSystemFile(id: SnowflakeId, signal?: AbortSignal): Promise<Blob> {
  return rawRequest<Blob>(`/system/files/${encodeURIComponent(id)}/download`, 'blob', { signal })
}

export function deleteSystemFile(id: SnowflakeId): Promise<void> {
  return request<void>(`/system/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function deleteSystemFilesBatch(ids: SnowflakeId[]): Promise<void> {
  return request<void>('/system/files/batch', { method: 'DELETE', body: { ids } })
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
  }
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  const formatted = index === 0 ? String(Math.round(value)) : value.toFixed(value >= 100 ? 0 : 1)
  return `${formatted} ${units[index]}`
}
