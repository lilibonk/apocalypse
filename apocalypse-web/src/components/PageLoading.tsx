/**
 * 路由加载：PixelWave 家族的一维 PixelScale 音阶。
 * 16 根离散高度像素柱以 steps() 传播，替代高成本 Canvas 条带；保留 h-64 / className 契约。
 */

import { useTranslation } from 'react-i18next'

import { PixelScale } from '@/components/ui/pixel-scale'
import { cn } from '@/lib/utils'

export function PageLoading({ className }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex h-64 items-center justify-center bg-background', className)}>
      <PixelScale variant="page" label={t('common.pageLoading', { defaultValue: '页面加载中' })} />
    </div>
  )
}
