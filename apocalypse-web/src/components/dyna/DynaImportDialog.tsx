/**
 * DynaImportDialog：声明式 CSV 批量导入与标准模板下载弹窗（M3 / FE-W6）。
 * 对接端点：
 * - GET  {endpoint}/import-template （下载 CSV 模板）
 * - POST {endpoint}/import          （上传 CSV 文件并返回导入结果统计与错误行明细）
 */

import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { validateUploadFile } from '@/components/ui/file-upload'
import { PixelScale } from '@/effects/PixelWave'
import { http, rawRequest } from '@/lib/api/client'
import { toastApiError } from '@/lib/api/error-toast'

export interface CsvImportResult {
  totalRows: number
  successCount: number
  failureCount: number
  errors: string[]
}

export interface DynaImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: string
  templatePath?: string
  entityName: string
  templateFileName: string
  onImported: () => void
}

function triggerDownload(blob: Blob, fileName: string) {
  if (typeof window === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function DynaImportDialog({
  open,
  onOpenChange,
  endpoint,
  templatePath,
  entityName,
  templateFileName,
  onImported,
}: DynaImportDialogProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [result, setResult] = useState<CsvImportResult | null>(null)

  const handleClose = (nextOpen: boolean) => {
    if (submitting) return
    if (!nextOpen) {
      setSelectedFile(null)
      setFileError(null)
      setResult(null)
    }
    onOpenChange(nextOpen)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    setResult(null)
    if (!file) return
    const validation = validateUploadFile(file, { accept: '.csv,text/csv', maxSizeMb: 5 })
    if (validation) {
      setFileError(validation)
      setSelectedFile(null)
      return
    }
    setFileError(null)
    setSelectedFile(file)
  }

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true)
    try {
      const resolvedTemplatePath = templatePath ?? `${endpoint}/import-template`
      const blob = await rawRequest<Blob>(resolvedTemplatePath, 'blob')
      triggerDownload(blob, templateFileName)
    } catch (error) {
      toastApiError(error, t('common.模板下载失败', { defaultValue: '模板下载失败' }))
    } finally {
      setDownloadingTemplate(false)
    }
  }

  const handleImport = async () => {
    if (!selectedFile || submitting) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const importResult = (await http.post(`${endpoint}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })) as unknown as CsvImportResult
      setResult(importResult)
      if (importResult.successCount > 0) {
        onImported()
      }
      if (importResult.failureCount === 0) {
        toast.success(
          t('common.导入成功', {
            defaultValue: '成功导入 {{count}} 条数据',
            count: importResult.successCount,
          }),
        )
      }
    } catch (error) {
      toastApiError(error, t('common.导入失败', { defaultValue: 'CSV 导入失败' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="dyna-import-dialog">
        <DialogHeader>
          <DialogTitle>
            {t('common.导入实体', { defaultValue: '导入{{entity}}', entity: entityName })}
          </DialogTitle>
          <DialogDescription>
            {t('common.导入说明', {
              defaultValue: '请先下载标准 CSV 模板填写数据，单次支持最大 5 MB 的 UTF-8 CSV 文件。',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-control border border-border-subtle bg-muted/30 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">
              {t('common.模板文件', { defaultValue: '标准 CSV 模板' })}：{templateFileName}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={downloadingTemplate}
              onClick={() => void handleDownloadTemplate()}
            >
              <Download className="size-3.5" />
              {t('common.下载模板', { defaultValue: '下载模板' })}
            </Button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="sr-only"
            data-testid="csv-import-input"
          />

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                inputRef.current?.click()
              }
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <FileSpreadsheet className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">
              {selectedFile
                ? selectedFile.name
                : t('common.选择CSV文件', { defaultValue: '点击选择要导入的 CSV 文件' })}
            </span>
          </div>

          {fileError && (
            <p role="alert" className="text-xs text-destructive">
              {fileError}
            </p>
          )}

          {result && (
            <div
              role="status"
              className="space-y-2 rounded-control border border-border-subtle bg-card p-3 text-xs"
            >
              <p className="font-medium text-foreground">
                {t('common.导入结果摘要', {
                  defaultValue: '共解析 {{total}} 行：成功 {{success}} 行，失败 {{failed}} 行',
                  total: result.totalRows,
                  success: result.successCount,
                  failed: result.failureCount,
                })}
              </p>
              {result.errors.length > 0 && (
                <ul className="max-h-36 list-disc space-y-1 overflow-y-auto pl-4 text-destructive">
                  {result.errors.map((err, index) => (
                    <li key={index}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
            {t('common.关闭', { defaultValue: '关闭' })}
          </Button>
          <Button
            type="button"
            disabled={!selectedFile || submitting}
            onClick={() => void handleImport()}
          >
            {submitting ? (
              <PixelScale variant="inline" tone="current" />
            ) : (
              <Upload className="size-4" />
            )}
            {submitting
              ? t('common.导入中', { defaultValue: '导入中…' })
              : t('common.开始导入', { defaultValue: '开始导入' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
