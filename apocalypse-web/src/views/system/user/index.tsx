/**
 * 用户管理：DynaLayer schema 渲染版。
 * 手写版见 views/_dev/user-handwritten.tsx（不挂路由，视觉/交互回归对照物）。
 * 页面结构事实来源：./user.schema.ts（CI 由 components/dyna/__tests__/schema.test.ts 校验）。
 */

import { useMemo } from 'react'
import { useLocation } from 'react-router'

import { DynaPage, type DynaAsyncFieldValidator } from '@/components/dyna'
import { request } from '@/lib/api/client'
import { readWorkspaceContext } from '../shared/workspace-context'

import schema from './user.schema'
import { UserForm } from './UserForm'
import { UserWorkspace } from './UserWorkspace'

export default function UserPage() {
  const location = useLocation()
  const asyncValidators = useMemo<Record<string, DynaAsyncFieldValidator>>(
    () => ({
      username: async (value) => {
        const trimmed = value.trim()
        if (!trimmed) return null
        try {
          const available = await request<boolean>('/system/users/check-username', {
            query: { username: trimmed },
          })
          return available === false ? '用户名已存在' : null
        } catch {
          return null
        }
      },
    }),
    [],
  )
  return (
    <DynaPage
      schema={schema}
      formComponent={UserForm}
      asyncValidators={asyncValidators}
      entryContext={readWorkspaceContext(location.state, 'user')}
      workspace={(controls) => <UserWorkspace {...controls} />}
    />
  )
}
