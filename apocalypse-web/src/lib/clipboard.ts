/**
 * 剪贴板复制辅助与无障碍播报去重（基于现代 Clipboard API + `execCommand` 降级）。
 */

let lastLiveMessage = ''

/**
 * 复制文本到剪贴板：
 * - 空文本返回 `false`；
 * - 优先使用 `navigator.clipboard.writeText`；
 * - 权限受限或非 HTTPS 上下文时尝试只读离屏 `<textarea>` + `document.execCommand('copy')`；
 * - 全部失败时返回 `false`，避免误报成功。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (text.length === 0) return false

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Clipboard API rejected or blocked; fall back to legacy DOM selection copy below.
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'

  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.body.appendChild(textarea)
  try {
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy')
    return Boolean(ok)
  } catch {
    return false
  } finally {
    textarea.remove()
    if (activeElement && typeof activeElement.focus === 'function' && activeElement.isConnected) {
      activeElement.focus({ preventScroll: true })
    }
  }
}

/**
 * VoiceOver 会忽略与上次相同的 live-region 文案（即便中间清空）；
 * 连续相同文本时追加/剥离不换行空格 `\u00A0` 保证读屏重复播报。
 */
export function dedupeLiveAnnouncement(message: string): string {
  lastLiveMessage = message === lastLiveMessage ? `${message}\u00A0` : message
  return lastLiveMessage
}

/** 仅供单元测试重置 live-region 去重状态。 */
export function resetLiveAnnouncementForTests(): void {
  lastLiveMessage = ''
}
