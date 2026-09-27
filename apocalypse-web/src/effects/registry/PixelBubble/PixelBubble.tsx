/**
 * 柔和的品牌反馈气泡，保留 PixelBubble 调用接口。
 *
 * 历史来源：8bitcn UI — Dialogue / Alert，MIT License。
 * 原文：https://github.com/TheOrcDev/8bitcn-ui/blob/main/components/ui/8bit/blocks/dialogue.tsx
 * 归属见 public/licenses/8bitcn-ui.txt。现行视觉随 2026-09-27 设计定义改为
 * token 驱动的圆润边界，不保留旧像素阶梯 DOM。无动画，两个动效开关下均可读。
 */

import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export interface PixelBubbleProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function PixelBubble({ className, children, ...props }: PixelBubbleProps) {
  return (
    <div
      data-slot="feedback-bubble"
      className={cn(
        'relative rounded-panel border border-border-subtle bg-card px-4 py-3 text-sm text-card-foreground shadow-surface',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
