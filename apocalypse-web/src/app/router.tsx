/**
 * 路由装配：/login 公开，其余经 RequireAuth + AppLayout；业务路由由菜单树动态生成。
 */

import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { AppLayout } from '@/components/layout/AppLayout'
import { PageLoading } from '@/components/PageLoading'
import { RequireAuth } from '@/routes/guard'
import { useMenuRoutes } from '@/routes/menu-routes'

const LoginPage = lazy(() => import('@/views/login'))
const DashboardPage = lazy(() => import('@/views/dashboard'))

function NotFoundPage() {
  return (
    <div className="flex h-96 flex-col items-center justify-center gap-2 text-muted-foreground">
      <p className="text-4xl font-semibold tracking-tight text-foreground">404</p>
      <p className="text-sm">页面不存在或未被菜单收录</p>
    </div>
  )
}

/** 已认证区：布局 + 动态业务路由。 */
function ProtectedRoutes() {
  const { routeElements } = useMenuRoutes()

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <Suspense fallback={<PageLoading />}>
              <DashboardPage />
            </Suspense>
          }
        />
        {routeElements}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<PageLoading className="h-svh" />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <ProtectedRoutes />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
