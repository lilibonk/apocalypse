/**
 * 路由加载：轻量、连续的 PixelScale 等待反馈。
 * 保留 h-64 / className 与可访问加载状态，不创建 Canvas 或额外时间轴。
 */

import { useTranslation } from 'react-i18next'

import { PixelScale } from '@/effects/PixelWave'
import { cn } from '@/lib/utils'

export function PageLoading({ className }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex h-64 items-center justify-center bg-background', className)}>
      <PixelScale variant="page" label={t('common.pageLoading', { defaultValue: '页面加载中' })} />
    </div>
  )
}
