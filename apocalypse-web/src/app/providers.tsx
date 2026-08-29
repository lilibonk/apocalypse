/**
 * 应用级 Provider 装配：React Query、设置→DOM 生效层、i18n 语言同步、Tooltip、Sonner。
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'
import { ApiError } from '@/lib/api/client'
import { useSettings, useSettingsStore } from '@/stores/settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 业务错误（含 40100 兜底后抛出的）不重试；网络错误最多重试 2 次
      retry: (failureCount, error) => (error instanceof ApiError ? false : failureCount < 2),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

/** 设置 → DOM：dark class / data-accent / data-density / data-gray / data-motion。 */
function useApplySettingsToDom() {
  const { theme, accent, density, grayMode, motionEnabled, language } = useSettings()

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.accent = accent
    root.dataset.density = density
    root.dataset.gray = grayMode ? 'on' : 'off'
    delete root.dataset.weak
    root.dataset.motion = motionEnabled ? 'on' : 'off'
  }, [accent, density, grayMode, motionEnabled])

  // 设置面板语言 → i18n
  useEffect(() => {
    void i18n.changeLanguage(language)
  }, [language])
}

export function AppProviders({ children }: { children: ReactNode }) {
  useApplySettingsToDom()
  const theme = useSettingsStore((state) => state.theme)

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster theme={theme === 'system' ? 'system' : theme} position="top-center" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
