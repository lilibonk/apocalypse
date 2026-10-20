/**
 * 用户管理：DynaLayer schema 渲染版。
 * 手写版见 views/_dev/user-handwritten.tsx（不挂路由，视觉/交互回归对照物）。
 * 页面结构事实来源：./user.schema.ts（CI 由 components/dyna/__tests__/schema.test.ts 校验）。
 */

import { DynaPage } from '@/components/dyna'
import { useLocation } from 'react-router'
import { readWorkspaceContext } from '../shared/workspace-context'

import schema from './user.schema'
import { UserForm } from './UserForm'
import { UserWorkspace } from './UserWorkspace'

export default function UserPage() {
  const location = useLocation()
  return (
    <DynaPage
      schema={schema}
      formComponent={UserForm}
      entryContext={readWorkspaceContext(location.state, 'user')}
      workspace={(controls) => <UserWorkspace {...controls} />}
    />
  )
}
