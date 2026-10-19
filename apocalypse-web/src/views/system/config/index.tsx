/**
 * 参数设置：“参数值”工作区（多项草稿与原子保存，桌面与移动共用）+“参数定义”DynaPage（新增、改名、删除）。
 * 参数定义页面结构事实来源：./config.schema.ts。
 */

import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { DynaPage } from '@/components/dyna'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ConfigForm } from './ConfigForm'
import { ConfigWorkspace } from './ConfigWorkspace'
import schema from './config.schema'

export default function ConfigPage() {
  const { t } = useTranslation()
  const { t: systemT } = useTranslation('system')
  const [params, setParams] = useSearchParams()
  const tab = params.get('configView') === 'definitions' ? 'definitions' : 'values'
  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous)
            next.set('configView', value)
            return next
          },
          { replace: true },
        )
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
        {tab === 'values' && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('common.参数设置', { defaultValue: '参数设置' })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{systemT('configWorkspace.hint')}</p>
          </div>
        )}
        <TabsList className="ml-auto">
          <TabsTrigger value="values">{systemT('configWorkspace.values')}</TabsTrigger>
          <TabsTrigger value="definitions">{systemT('configWorkspace.definitions')}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="values" className="p-4 pb-24 sm:p-6 sm:pb-24">
        <ConfigWorkspace />
      </TabsContent>
      <TabsContent value="definitions">
        <DynaPage schema={schema} formComponent={ConfigForm} />
      </TabsContent>
    </Tabs>
  )
}
