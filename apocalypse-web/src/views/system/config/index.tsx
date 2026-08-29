/**
 * 参数设置：DynaLayer schema 渲染版。
 * 页面结构事实来源：./config.schema.ts（CI 由 components/dyna/__tests__/schema.test.ts 校验）。
 */

import { DynaPage } from '@/components/dyna'

import schema from './config.schema'

export default function ConfigPage() {
  return <DynaPage schema={schema} />
}
