/**
 * 用户管理：DynaLayer schema 渲染版。
 * 手写版见 views/_dev/user-handwritten.tsx（不挂路由，视觉/交互回归对照物）。
 * 页面结构事实来源：./user.schema.ts（CI 由 components/dyna/__tests__/schema.test.ts 校验）。
 */

import { DynaPage } from '@/components/dyna'

import schema from './user.schema'

export default function UserPage() {
  return <DynaPage schema={schema} />
}
