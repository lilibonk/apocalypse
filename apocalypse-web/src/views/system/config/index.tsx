/**
 * 参数设置：“参数值”工作区（多项草稿与原子保存，桌面与移动共用）+“参数定义”DynaPage（新增、改名、删除）。
 * 参数定义页面结构事实来源：./config.schema.ts。
 */

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useTranslation } from 'react-i18next'

import { DynaPage } from '@/components/dyna'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { usePageView } from '@/hooks/usePageView'

import { ConfigForm } from './ConfigForm'
import { ConfigWorkspace } from './ConfigWorkspace'
import schema from './config.schema'

const CONFIG_VIEWS = ['values', 'definitions'] as const

export default function ConfigPage() {
  const epoch = useAuthStore((state) => state.authorizationEpoch)
  return <ConfigPageContent key={epoch} />
}

function ConfigPageContent() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const [view, setView] = usePageView(CONFIG_VIEWS, 'configView')
  const [definitionsVisited, setDefinitionsVisited] = useState(view === 'definitions')
  if (view === 'definitions' && !definitionsVisited) setDefinitionsVisited(true)
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('common.参数设置', { defaultValue: '参数设置' })}
        description={systemT('configWorkspace.hint')}
        view={
          <SegmentedControl
            label={t('dyna.pageView')}
            value={view}
            onChange={setView}
            options={[
              { value: 'values', label: systemT('configWorkspace.values') },
              { value: 'definitions', label: systemT('configWorkspace.definitions') },
            ]}
          />
        }
      />
      <div className="pb-24" hidden={view !== 'values'}>
        <ConfigWorkspace active={view === 'values'} />
      </div>
      {definitionsVisited && (
        <div hidden={view !== 'definitions'}>
          <DynaPage schema={schema} formComponent={ConfigForm} embedded />
        </div>
      )}
    </div>
  )
}
