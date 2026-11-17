/**
 * 应用级 Provider 装配：React Query、设置→DOM 生效层、i18n 语言同步、Tooltip、Sonner。
 */

import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'

import { SvgThemeFilters } from '@/components/motion/SvgThemeFilters'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'
import { useSettings } from '@/stores/settings'

import { queryClient } from './query-client'

/** 设置 → DOM：data-theme-world / dark class / data-accent / data-density / data-gray / data-motion。 */
function useApplySettingsToDom() {
  const { themeWorld, accent, density, grayMode, motionEnabled, language } = useSettings()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', themeWorld === 'obsidian')
    root.dataset.themeWorld = themeWorld
    root.dataset.accent = accent
    root.dataset.density = density
    root.dataset.gray = grayMode ? 'on' : 'off'
    delete root.dataset.weak
    root.dataset.motion = motionEnabled ? 'on' : 'off'
  }, [accent, density, grayMode, motionEnabled, themeWorld])

  // 设置面板语言 → i18n
  useEffect(() => {
    void i18n.changeLanguage(language)
  }, [language])
}

export function AppProviders({ children }: { children: ReactNode }) {
  useApplySettingsToDom()
  const { themeWorld } = useSettings()
  const sonnerTheme = themeWorld === 'obsidian' ? 'dark' : 'light'

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <SvgThemeFilters />
        {children}
        <Toaster theme={sonnerTheme} position="top-center" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
