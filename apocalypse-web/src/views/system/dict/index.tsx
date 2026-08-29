/**
 * 字典管理：页签内嵌两个 DynaPage（字典类型 / 字典数据，页面结构事实来源为各自 schema）。
 * 页签条与 DynaPage 同宽对齐；移动端保持紧凑内边距。
 */

import { useTranslation } from 'react-i18next'

import { DynaPage } from '@/components/dyna'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import dataSchema from './dict-data.schema'
import typeSchema from './dict-type.schema'

export default function DictPage() {
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
