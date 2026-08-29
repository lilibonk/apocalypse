/**
 * 正式品牌签名：静态图形标 + APOCALYPSE 字标。
 *
 * 与 PixelOrb 吉祥物严格分离。签名用于侧栏、登录页首与产品署名；吉祥物只承担
 * 登录 / 加载 / 空态 / 成功 / 异常反馈中的“值守向导”角色。
 */

import { cn } from '@/lib/utils'

export function BrandSignature({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <img src="/favicon.svg" alt="" width="28" height="28" className="size-7 shrink-0" />
      {!compact && (
        <div className="min-w-0 leading-none">
          <div className="truncate text-sm font-semibold tracking-[0.12em]">APOCALYPSE</div>
          <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Admin foundation
          </div>
        </div>
      )}
    </div>
  )
}
