/**
 * 路由级错误边界：包裹主工作区 <Outlet />，防止单个页面渲染异常或懒加载 chunk 失败击穿整站。
 * 路由切换（resetKey 变化）时自动复位。
 */

import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/client'
import { DASHBOARD_TAB } from '@/stores/tabs'

interface BoundaryProps {
  resetKey: string
  children: ReactNode
  onBackToDashboard: () => void
  texts: {
    title: string
    description: string
    retry: string
    backToDashboard: string
    copyTrace: string
    copied: string
  }
}

interface BoundaryState {
  error: Error | null
}

class RouteErrorBoundaryInner extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidUpdate(prevProps: BoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  private handleBack = () => {
    this.setState({ error: null })
    this.props.onBackToDashboard()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const { texts } = this.props
    const traceId = error instanceof ApiError ? error.traceId : null

    return (
      <div className="p-4 sm:p-6">
        <div
          role="alert"
          data-slot="route-error-boundary"
          className="mx-auto max-w-xl rounded-panel border border-border bg-card p-6 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-control bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">{texts.title}</h2>
              <p className="text-sm text-muted-foreground">{texts.description}</p>
              {error.message && (
                <p className="rounded-control bg-muted px-3 py-2 font-mono text-xs break-words text-foreground">
                  {error.message}
                </p>
              )}
              {traceId && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="font-mono">Trace: {traceId}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      void navigator.clipboard?.writeText(traceId).then(() => {
                        toast.success(texts.copied)
                      })
                    }}
                  >
                    {texts.copyTrace}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={this.handleBack}>
              <Home className="size-3.5" aria-hidden="true" />
              {texts.backToDashboard}
            </Button>
            <Button type="button" size="sm" onClick={this.handleRetry}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {texts.retry}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <RouteErrorBoundaryInner
      resetKey={`${location.pathname}${location.search}`}
      onBackToDashboard={() => void navigate(DASHBOARD_TAB.key, { replace: true })}
      texts={{
        title: t('route.errorTitle', { defaultValue: '页面加载或渲染异常' }),
        description: t('route.errorDescription', {
          defaultValue:
            '当前工作区遇到意外错误，导航栏与其他页签不受影响，可尝试重试或返回工作台。',
        }),
        retry: t('dyna.queryRetry', { defaultValue: '重试' }),
        backToDashboard: t('route.backToDashboard', { defaultValue: '返回工作台' }),
        copyTrace: t('common.copyTraceId', { defaultValue: '复制 Trace ID' }),
        copied: t('common.copied', { defaultValue: '已复制' }),
      }}
    >
      {children}
    </RouteErrorBoundaryInner>
  )
}
