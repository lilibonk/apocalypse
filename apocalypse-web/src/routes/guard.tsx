/**
 * 路由守卫：登录态 + 当前用户视图加载。
 * 按钮/区块级权限用 components/Perm。
 */

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const tokens = useAuthStore((state) => state.tokens)
  const meLoaded = useAuthStore((state) => state.meLoaded)
  const ensureMe = useAuthStore((state) => state.ensureMe)
  const location = useLocation()

  useEffect(() => {
    if (tokens && !meLoaded) {
      void ensureMe().catch(() => {
        // token 失效等：client 层 40100 已负责登出跳转；此处兜底清理
        useAuthStore.getState().clearSession()
      })
    }
  }, [tokens, meLoaded, ensureMe])

  if (!tokens) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (!meLoaded) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="w-64 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  }

  return children
}
