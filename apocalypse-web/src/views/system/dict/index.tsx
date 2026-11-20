/**
 * 字典管理：桌面默认“卡片册”（类型与值同屏、原地展开），可切换到原有“列表”双页签；
 * 移动端保留双页签列表。列表视图复用各自 schema 与 Headless DynaController，头部操作栏始终齐平。
 */

import { BookOpen, List, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DynaDialogs,
  DynaTable,
  DynaToolbar,
  DynaToolbarActions,
  useDynaController,
} from '@/components/dyna'
import { Perm } from '@/components/Perm'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDesktopViewport } from '@/hooks/useDesktopViewport'
import { usePageView } from '@/hooks/usePageView'
import { useAuthStore } from '@/stores/auth'

import { DictBook } from './DictBook'
import dataSchema from './dict-data.schema'
import typeSchema from './dict-type.schema'

const DICT_VIEWS = ['cards', 'list'] as const
type DictListTab = 'type' | 'data'

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
  const [activeListTab, setActiveListTab] = useState<DictListTab>('type')
  const [visitedList, setVisitedList] = useState(!desktop || requestedView === 'list')
  const [visitedDataTab, setVisitedDataTab] = useState(false)

  // Narrow screens keep the established list; the card book is a desktop workspace.
  // A live card dialog remains mounted across a resize until its operation is resolved.
  const view = busy || createOpen ? 'cards' : desktop ? requestedView : 'list'
  if (view === 'list' && !visitedList) setVisitedList(true)
  if (visitedList && activeListTab === 'data' && !visitedDataTab) setVisitedDataTab(true)

  const typeController = useDynaController(typeSchema, {
    embedded: true,
    enabled: visitedList,
  })
  const dataController = useDynaController(dataSchema, {
    embedded: true,
    enabled: visitedList && visitedDataTab,
  })
  const activeController = activeListTab === 'type' ? typeController : dataController

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title={t('common.字典管理', { defaultValue: '字典管理' })}
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
          ) : (
            <DynaToolbarActions controller={activeController} />
          )
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
          <Tabs
            value={activeListTab}
            onValueChange={(next) => setActiveListTab(next as DictListTab)}
            className="gap-4"
          >
            <TabsList variant="line" className="w-full justify-start border-b border-border-subtle">
              <TabsTrigger value="type" className="flex-none px-3">
                {t('dyna.字典类型', { defaultValue: '字典类型' })}
              </TabsTrigger>
              <TabsTrigger value="data" className="flex-none px-3">
                {t('dyna.字典数据', { defaultValue: '字典数据' })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="type" className="space-y-4">
              <DynaToolbar controller={typeController} presentation="panel" />
              <DynaTable {...typeController.collection} />
              <DynaDialogs controller={typeController} />
            </TabsContent>

            <TabsContent value="data" className="space-y-4">
              <DynaToolbar controller={dataController} presentation="panel" />
              <DynaTable {...dataController.collection} />
              <DynaDialogs controller={dataController} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
