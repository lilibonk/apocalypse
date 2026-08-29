/**
 * Pixel Bubble —— 8-bit 像素阶梯边框气泡（纯 CSS，零动画、无外部像素字体）。
 *
 * 来源：8bitcn UI — Dialogue（gaming block）+ Alert（像素边框技法）
 * 原文：https://github.com/TheOrcDev/8bitcn-ui/blob/main/components/ui/8bit/blocks/dialogue.tsx
 *       https://github.com/TheOrcDev/8bitcn-ui/blob/main/components/ui/8bit/alert.tsx
 * 许可：MIT License（8bitcn UI © TheOrcDev）
 * 适配说明：
 * - 只取 CSS 部分：12 个角/边小块拼出像素阶梯边框；不引入其 shadcn Alert/Avatar
 *   组件链，也不引入 Press Start 2P 等外部像素字体（字体沿用现有 --font-sans 栈）。
 * - 边框色沿用其 token 表达 bg-foreground dark:bg-ring（本仓库 --ring 即 --brand），
 *   盒体 bg-card text-card-foreground，全程无颜色字面量，暗色同样成立。
 * - 组件零动画，天然满足 prefers-reduced-motion 与设置面板 motionEnabled 双开关
 *   （降级=静态形态，本组件恒为静态形态）。
 */

import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export interface PixelBubbleProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}

/** 8bitcn 像素阶梯边框：顶/底两段半宽横条 + 四角方块 + 左右两段半高竖条。 */
const FRAME_BLOCKS = [
  '-top-1.5 left-1.5 h-1.5 w-1/2',
  '-top-1.5 right-1.5 h-1.5 w-1/2',
  '-bottom-1.5 left-1.5 h-1.5 w-1/2',
  '-bottom-1.5 right-1.5 h-1.5 w-1/2',
  'top-0 left-0 size-1.5',
  'top-0 right-0 size-1.5',
  'bottom-0 left-0 size-1.5',
  'bottom-0 right-0 size-1.5',
  'top-1.5 -left-1.5 h-1/2 w-1.5',
  'bottom-1.5 -left-1.5 h-1/2 w-1.5',
  'top-1.5 -right-1.5 h-1/2 w-1.5',
  'bottom-1.5 -right-1.5 h-1/2 w-1.5',
] as const

export function PixelBubble({ className, children, ...props }: PixelBubbleProps) {
  return (
    <div className={cn('relative', className)}>
      <div className="relative bg-card px-3 py-2 text-sm text-card-foreground" {...props}>
        {children}
      </div>
      {FRAME_BLOCKS.map((block) => (
        <div key={block} aria-hidden className={cn('absolute bg-foreground dark:bg-ring', block)} />
      ))}
    </div>
  )
}
