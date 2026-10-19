/**
 * 字典管理：桌面默认“卡片册”（类型与值同屏、原地展开），可切换到原有“列表”双页签 DynaPage；
 * 移动端保留双页签列表。列表视图的页面结构事实来源仍为各自 schema。
 */

import { BookOpen, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { DynaPage } from '@/components/dyna'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'

import { DictBook } from './DictBook'
import dataSchema from './dict-data.schema'
import typeSchema from './dict-type.schema'

function DictTabs() {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue="type">
      <div className="w-full px-4 pt-4 sm:px-6 sm:pt-6">
        <TabsList>
          <TabsTrigger value="type">{t('dyna.字典类型', { defaultValue: '字典类型' })}</TabsTrigger>
          <TabsTrigger value="data">{t('dyna.字典数据', { defaultValue: '字典数据' })}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="type">
        <DynaPage schema={typeSchema} />
      </TabsContent>
      <TabsContent value="data">
        <DynaPage schema={dataSchema} />
      </TabsContent>
    </Tabs>
  )
}

export default function DictPage() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const desktop = useDesktopViewport()
  const [params, setParams] = useSearchParams()
  if (!desktop) return <DictTabs />
  const view = params.get('dictView') === 'list' ? 'list' : 'cards'
  const switcher = (
    <div
      className="view-switch flex rounded-xl p-1"
      role="group"
      aria-label={systemT('dictBook.view')}
    >
      {(['cards', 'list'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium"
          aria-pressed={view === kind}
          onClick={() =>
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous)
                next.set('dictView', kind)
                return next
              },
              { replace: true },
            )
          }
        >
          {kind === 'cards' ? (
            <BookOpen aria-hidden className="size-4" />
          ) : (
            <List aria-hidden className="size-4" />
          )}
          {systemT(`dictBook.${kind}`)}
        </button>
      ))}
    </div>
  )
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
        {view === 'cards' && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('common.字典管理', { defaultValue: '字典管理' })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('common.字典类型与取值', { defaultValue: '字典类型与取值' })}
            </p>
          </div>
        )}
        <div className="ml-auto">{switcher}</div>
      </div>
      {view === 'cards' ? (
        <div className="p-4 sm:p-6">
          <DictBook />
        </div>
      ) : (
        <DictTabs />
      )}
    </div>
  )
}
