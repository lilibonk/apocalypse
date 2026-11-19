import i18n from 'i18next'
import { toast } from 'sonner'

import { copyTextToClipboard } from '@/lib/clipboard'
import { ApiError } from './client'

export function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * 统一展示业务/系统错误 Toast：
 * - 优先使用后端返回的 ApiError.message；
 * - 若携带后端 traceId，则在 description 透出并提供一键复制入口。
 */
export function toastApiError(error: unknown, fallback: string): void {
  const message = errorText(error, fallback)
  const traceId = error instanceof ApiError ? error.traceId : null
  if (!traceId) {
    toast.error(message)
    return
  }
  const copyLabel = i18n.isInitialized
    ? i18n.t('common.copyTraceId', { defaultValue: '复制 Trace ID' })
    : '复制 Trace ID'
  const copiedLabel = i18n.isInitialized
    ? i18n.t('common.copied', { defaultValue: '已复制' })
    : '已复制'
  const copyFailedLabel = i18n.isInitialized
    ? i18n.t('common.copyFailed', { defaultValue: '复制失败，请手动选择复制' })
    : '复制失败，请手动选择复制'
  toast.error(message, {
    description: `Trace: ${traceId}`,
    action: {
      label: copyLabel,
      onClick: () => {
        void copyTextToClipboard(traceId).then((ok) => {
          if (ok) toast.success(copiedLabel)
          else toast.error(copyFailedLabel)
        })
      },
    },
  })
}
