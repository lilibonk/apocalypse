/**
 * 字典管理：桌面默认“卡片册”（类型与值同屏、原地展开），可切换到原有“列表”双页签 DynaPage；
 * 移动端保留双页签列表。列表视图的页面结构事实来源仍为各自 schema。
 */

import { BookOpen, List, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaPage } from '@/components/dyna'
import { Perm } from '@/components/Perm'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { useAuthStore } from '@/stores/auth'

import { DictBook } from './DictBook'
import dataSchema from './dict-data.schema'
import typeSchema from './dict-type.schema'

function DictTabs() {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue="type" className="gap-5">
      <TabsList variant="line">
        <TabsTrigger value="type">{t('dyna.字典类型', { defaultValue: '字典类型' })}</TabsTrigger>
        <TabsTrigger value="data">{t('dyna.字典数据', { defaultValue: '字典数据' })}</TabsTrigger>
      </TabsList>
      <TabsContent value="type">
        <DynaPage schema={typeSchema} embedded />
      </TabsContent>
      <TabsContent value="data">
        <DynaPage schema={dataSchema} embedded />
      </TabsContent>
    </Tabs>
  )
}

const DICT_VIEWS = ['cards', 'list'] as const

export default function DictPage() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  const session = useAuthStore((state) => state.sessionEpoch)
  return <DictWorkspace key={`${session}:${epoch}`} />
}

function DictWorkspace() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const desktop = useDesktopViewport()
  const [requestedView, setView] = usePageView(DICT_VIEWS, 'dictView')
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [visitedList, setVisitedList] = useState(!desktop || requestedView === 'list')
  // Narrow screens keep the established list; the card book is a desktop workspace.
  // A live card dialog remains mounted across a resize until its operation is resolved.
  const view = busy || createOpen ? 'cards' : desktop ? requestedView : 'list'
  if (view === 'list' && !visitedList) setVisitedList(true)
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('common.字典管理', { defaultValue: '字典管理' })}
        description={t('common.字典类型与取值', { defaultValue: '字典类型与取值' })}
        view={
          desktop ? (
            <SegmentedControl
              label={systemT('dictBook.view')}
              value={view}
              onChange={setView}
              disabled={busy || createOpen}
              options={[
                { value: 'cards', label: systemT('dictBook.cards'), icon: BookOpen },
                { value: 'list', label: systemT('dictBook.list'), icon: List },
              ]}
            />
          ) : undefined
        }
        actions={
          view === 'cards' ? (
            <Perm perm={typeSchema.createPerm!}>
              <Button disabled={busy} onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" />
                {systemT('dictBook.addType')}
              </Button>
            </Perm>
          ) : undefined
        }
      />
      <div hidden={view !== 'cards'}>
        <DictBook
          active={view === 'cards'}
          createOpen={createOpen}
          onCreateOpenChange={setCreateOpen}
          onBusyChange={setBusy}
        />
      </div>
      {visitedList && (
        <div hidden={view !== 'list'}>
          <DictTabs />
        </div>
      )}
    </div>
  )
}
