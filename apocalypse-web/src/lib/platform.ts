/**
 * 运行平台探测与快捷键文案格式化（macOS / iOS 显示 `⌘`，Windows / Linux 显示 `Ctrl+`）。
 */

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string
  }
}

export function isApplePlatform(platformHint?: string): boolean {
  const raw =
    platformHint ??
    (typeof navigator !== 'undefined'
      ? (navigator as NavigatorWithUserAgentData).userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent ||
        ''
      : '')
  return /Mac|iPhone|iPad|iPod/i.test(raw)
}

export function formatModShortcut(key: string, apple = isApplePlatform()): string {
  const upper = key.toUpperCase()
  return apple ? `⌘${upper}` : `Ctrl+${upper}`
}
