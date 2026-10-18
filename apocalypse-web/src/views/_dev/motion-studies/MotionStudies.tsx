/** A bounded visual study, outside standard CRUD and all authenticated production routes. */
import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  ChevronRight,
  Columns3,
  FlaskConical,
  Languages,
  LayoutDashboard,
  Moon,
  Network,
  Pause,
  Play,
  RotateCcw,
  Sun,
} from 'lucide-react'

import { BrandSignature } from '@/components/BrandSignature'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSettings, useSettingsStore } from '@/stores/settings'

import { DashboardStudy } from './DashboardStudy'
import { PermissionStudy } from './PermissionStudy'
import { useStudyReducedMotion } from './useStudyReducedMotion'
import './studies.css'

type StudyPage = 'dashboard' | 'permissions'

const copy = {
  zh: {
    workspace: '示例工作区',
    dashboard: '工作台',
    permissions: '权限图谱',
    navigation: '工作空间',
    overview: '掌握全局，从容开始。',
    overviewHint: '从访问趋势到每一次操作，让重要信息自然浮现。',
    graphTitle: '每一项权限，都有迹可循。',
    graphHint: '选择一个角色，探索菜单与操作之间的授权关系。',
    sample: '示例数据',
    sampleNote: '这是可交互设计样板，所有数据均为本地示例。',
    theme: '切换明暗主题',
    language: 'Switch to English',
    motion: '动画',
    motionOn: '动画已开启',
    motionOff: '动画已关闭',
    reduced: '已遵循系统减少动态设置',
    density: '切换界面密度',
    replay: '重播入场',
    footer: '为复杂系统，保留秩序。',
    explore: '探索权限关系',
    preview: '设计样板',
  },
  en: {
    workspace: 'Sample workspace',
    dashboard: 'Dashboard',
    permissions: 'Permission graph',
    navigation: 'WORKSPACE',
    overview: 'A clear view. A confident start.',
    overviewHint: 'From access trends to every action, keep the important details in view.',
    graphTitle: 'Every permission has a story.',
    graphHint: 'Select a role to explore how its menus and actions are connected.',
    sample: 'Sample data',
    sampleNote: 'An interactive design study. All data is a local example.',
    theme: 'Toggle light and dark theme',
    language: '切换到中文',
    motion: 'Motion',
    motionOn: 'Motion is on',
    motionOff: 'Motion is off',
    reduced: 'System reduced-motion preference is active',
    density: 'Toggle interface density',
    replay: 'Replay entrance',
    footer: 'Bringing order to complex systems.',
    explore: 'Explore permissions',
    preview: 'Design study',
  },
}

function pageFromHash(): StudyPage {
  return window.location.hash === '#permissions' ? 'permissions' : 'dashboard'
}

export function MotionStudies() {
  const [page, setPage] = useState<StudyPage>(pageFromHash)
  const [replay, setReplay] = useState(0)
  const settings = useSettings()
  const reduced = useStudyReducedMotion()
  const t = copy[settings.language]
  const motionEnabled = settings.motionEnabled && !reduced
  const pageTitle = page === 'dashboard' ? t.dashboard : t.permissions

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (next: StudyPage) => {
    window.location.hash = next
    setPage(next)
  }

  const toggleTheme = () => {
    const dark = document.documentElement.classList.contains('dark')
    useSettingsStore.getState().setTheme(dark ? 'light' : 'dark')
  }

  return (
    <div className="motion-studies" data-testid="motion-studies" data-animation={motionEnabled}>
      <a
        href="#study-content"
        className="study-skip-link"
        onClick={(event) => {
          event.preventDefault()
          const content = document.getElementById('study-content')
          content?.focus()
          content?.scrollIntoView({ behavior: 'instant', block: 'start' })
        }}
      >
        {pageTitle}
      </a>
      <aside className="study-sidebar">
        <div className="study-brand">
          <BrandSignature />
        </div>
        <div className="study-workspace">
          <span className="study-workspace-icon">
            <Columns3 className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.workspace}</span>
          <span className="size-1.5 rounded-full bg-brand-text" aria-hidden="true" />
        </div>
        <nav aria-label={t.navigation} className="study-navigation">
          <p className="study-eyebrow px-3 pb-3">{t.navigation}</p>
          {(
            [
              ['dashboard', LayoutDashboard, t.dashboard],
              ['permissions', Network, t.permissions],
            ] as const
          ).map(([id, Icon, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={page === id ? 'page' : undefined}
              className={cn('study-nav-item', page === id && 'is-current')}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
              {page === id && <ChevronRight className="ml-auto size-3.5" aria-hidden="true" />}
            </a>
          ))}
        </nav>
        <div className="study-sidebar-note">
          <FlaskConical className="mb-3 size-5 text-brand-text" aria-hidden="true" />
          <p className="text-sm font-semibold">{t.preview}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.sampleNote}</p>
        </div>
        <p className="study-sidebar-footer">
          Apocalypse <span>01</span>
        </p>
      </aside>

      <div className="study-shell">
        <header className="study-toolbar">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{t.workspace}</span>
            <ChevronRight
              className="hidden size-3 text-muted-foreground sm:inline"
              aria-hidden="true"
            />
            <span className="truncate font-medium">{pageTitle}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={settings.motionEnabled}
              title={reduced ? t.reduced : settings.motionEnabled ? t.motionOn : t.motionOff}
              onClick={() => useSettingsStore.getState().setMotionEnabled(!settings.motionEnabled)}
            >
              {motionEnabled ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              <span className="hidden sm:inline">{t.motion}</span>
              <span className="sr-only sm:hidden">{t.motion}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.density}
              title={t.density}
              onClick={() =>
                useSettingsStore
                  .getState()
                  .setDensity(settings.density === 'comfortable' ? 'compact' : 'comfortable')
              }
            >
              <Columns3 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.theme}
              title={t.theme}
              onClick={toggleTheme}
            >
              <Moon className="dark:hidden" />
              <Sun className="hidden dark:block" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.language}
              title={t.language}
              onClick={() =>
                useSettingsStore.getState().setLanguage(settings.language === 'zh' ? 'en' : 'zh')
              }
            >
              <Languages />
            </Button>
          </div>
        </header>

        <main id="study-content" className="study-main" tabIndex={-1}>
          <div className="study-page-heading">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <p className="study-eyebrow">
                  {page === 'dashboard' ? 'OVERVIEW' : 'ACCESS EXPLORER'}
                </p>
                <span className="study-sample-label">{t.sample}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {page === 'dashboard' ? t.overview : t.graphTitle}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {page === 'dashboard' ? t.overviewHint : t.graphHint}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={!motionEnabled}
                aria-label={t.replay}
                title={t.replay}
                onClick={() => setReplay((n) => n + 1)}
              >
                <RotateCcw />
              </Button>
              {page === 'dashboard' && (
                <Button className="study-primary-action" onClick={() => navigate('permissions')}>
                  {t.explore}
                  <ArrowUpRight />
                </Button>
              )}
            </div>
          </div>
          {reduced && (
            <p role="status" className="mb-4 text-xs text-muted-foreground">
              {t.reduced}
            </p>
          )}
          <div key={`${page}-${replay}`}>
            {page === 'dashboard' ? (
              <DashboardStudy
                language={settings.language}
                motionEnabled={motionEnabled}
                onOpenGraph={() => navigate('permissions')}
              />
            ) : (
              <PermissionStudy language={settings.language} motionEnabled={motionEnabled} />
            )}
          </div>
          <footer className="study-page-footer">
            <span>{t.footer}</span>
            <span>{t.sampleNote}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
