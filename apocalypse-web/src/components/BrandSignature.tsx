/**
 * 品牌签名：README 同源的 Apo 图形标 + Apocalypse 字标。
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
      <span className="size-7 shrink-0">
        <img
          src="/brand/apo-mark.svg"
          alt=""
          width="28"
          height="28"
          className="block size-full dark:hidden"
        />
        <img
          src="/brand/apo-mark-dark.svg"
          alt=""
          width="28"
          height="28"
          className="hidden size-full dark:block"
        />
      </span>
      {!compact && (
        <div className="min-w-0 leading-none">
          <div className="truncate text-base font-semibold tracking-tight">Apocalypse</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">Admin foundation</div>
        </div>
      )}
    </div>
  )
}
