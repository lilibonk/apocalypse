/**
 * 通用文件上传组件（M2 / FE-W6）：
 * - 支持点击与拖拽选择、扩展名/MIME 白名单校验、文件体积上限校验；
 * - 内置流体上传进度条（遵守 token-only 与双动效开关）；
 * - 可通过 uploadFile 注入真实上传函数（默认调 POST /system/files/upload）。
 */

import { FileText, Upload, X } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { http } from '@/lib/api/client'
import { toastApiError } from '@/lib/api/error-toast'
import { cn } from '@/lib/utils'

export interface UploadedFileResult {
  key: string
  originalFilename?: string
  contentType?: string
  size?: number
}

export interface FileUploadProps {
  value?: string
  onValueChange?: (value: string, meta?: UploadedFileResult) => void
  accept?: string
  maxSizeMb?: number
  disabled?: boolean
  className?: string
  uploadFn?: (
    file: File,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ) => Promise<UploadedFileResult | string>
}

export function validateUploadFile(
  file: File,
  options: { accept?: string; maxSizeMb?: number },
): string | null {
  if (options.maxSizeMb !== undefined && file.size > options.maxSizeMb * 1024 * 1024) {
    return `文件大小不能超过 ${options.maxSizeMb} MB`
  }
  if (options.accept) {
    const rules = options.accept
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    if (rules.length > 0) {
      const fileName = file.name.toLowerCase()
      const mimeType = (file.type || '').toLowerCase()
      const matched = rules.some((rule) => {
        if (rule.startsWith('.')) return fileName.endsWith(rule)
        if (rule.endsWith('/*')) return mimeType.startsWith(rule.slice(0, -1))
        return mimeType === rule
      })
      if (!matched) {
        return `不支持的文件格式（允许：${options.accept}）`
      }
    }
  }
  return null
}

async function defaultUploadFn(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFileResult> {
  const formData = new FormData()
  formData.append('file', file)
  const result = (await http.post('/system/files/upload', formData, {
    signal,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    },
  })) as unknown as UploadedFileResult
  return result
}

export function FileUpload({
  value = '',
  onValueChange,
  accept,
  maxSizeMb = 10,
  disabled = false,
  className,
  uploadFn = defaultUploadFn,
}: FileUploadProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const handleCancelUpload = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setUploading(false)
    setProgress(0)
    setFileName('')
  }

  const handleFile = async (file: File) => {
    if (disabled || uploading) return
    const validationError = validateUploadFile(file, { accept, maxSizeMb })
    if (validationError) {
      setError(validationError)
      return
    }
    const controller = new AbortController()
    abortControllerRef.current = controller
    setError(null)
    setUploading(true)
    setProgress(15)
    setFileName(file.name)
    try {
      const uploaded = await uploadFn(file, setProgress, controller.signal)
      if (controller.signal.aborted) return
      setProgress(100)
      if (typeof uploaded === 'string') {
        onValueChange?.(uploaded, { key: uploaded, originalFilename: file.name, size: file.size })
      } else {
        onValueChange?.(uploaded.key, uploaded)
      }
    } catch (uploadError) {
      if (
        controller.signal.aborted ||
        (uploadError instanceof Error &&
          (uploadError.name === 'CanceledError' || uploadError.name === 'AbortError'))
      ) {
        return
      }
      const msg =
        uploadError instanceof Error
          ? uploadError.message
          : t('common.上传失败', { defaultValue: '文件上传失败' })
      setError(msg)
      toastApiError(uploadError, msg)
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
        setUploading(false)
      }
    }
  }

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) void handleFile(selected)
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) void handleFile(dropped)
  }

  return (
    <div className={cn('space-y-2', className)} data-slot="file-upload">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled || uploading}
        onChange={onInputChange}
        className="sr-only"
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || uploading}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !disabled && !uploading) {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled && !uploading) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-control border border-dashed px-4 py-5 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/40',
          (disabled || uploading) && 'pointer-events-none opacity-60',
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
        <div className="text-xs">
          <span className="font-medium text-foreground">
            {t('common.点击或拖拽文件到此上传', { defaultValue: '点击或拖拽文件到此上传' })}
          </span>
          <p className="mt-0.5 text-muted-foreground">
            {accept ? `${accept} · ` : ''}
            {t('common.最大文件大小', {
              defaultValue: '最大 {{max}} MB',
              max: maxSizeMb,
            })}
          </p>
        </div>
      </div>

      {uploading && (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{fileName}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums">{progress}%</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                data-slot="file-upload-cancel"
                aria-label={t('common.取消上传', { defaultValue: '取消上传' })}
                onClick={handleCancelUpload}
              >
                <X className="size-3" />
                {t('common.取消上传', { defaultValue: '取消上传' })}
              </Button>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              data-slot="file-upload-progress"
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {!uploading && value && (
        <div className="flex items-center justify-between gap-2 rounded-control border border-border-subtle bg-card px-3 py-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-mono text-foreground">{fileName || value}</span>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              aria-label={t('common.移除文件', { defaultValue: '移除文件' })}
              onClick={() => {
                setFileName('')
                onValueChange?.('')
              }}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
