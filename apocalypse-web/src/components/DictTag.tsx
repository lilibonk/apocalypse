/**
 * 字典标签：按字典类型渲染 value 对应的中文 label 与语义色调（优先消费后端 D2 持久化的 `tagTone`）。
 * 字典数据经 react-query 缓存（5 分钟），同类型多处使用只请求一次。
 */

import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { getDictDataByType } from '@/lib/api/dict'
import type { DictTone } from '@/lib/api/types'

export type DictBadgeVariant =
  'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive'

// eslint-disable-next-line react-refresh/only-export-components
export function resolveDictBadgeVariant(
  type: string,
  value: string,
  tagTone?: DictTone | null,
): DictBadgeVariant {
  switch (tagTone) {
    case 'BRAND':
      return 'default'
    case 'INFO':
      return 'info'
    case 'SUCCESS':
      return 'success'
    case 'WARNING':
      return 'warning'
    case 'DANGER':
      return 'destructive'
    default:
      break
  }
  if ((type === 'sys_user_status' || type === 'sys_common_status') && value === '1') {
    return 'success'
  }
  if (type === 'sys_common_status' && value === '0') {
    return 'destructive'
  }
  if (type === 'sys_user_status' && value === '0') {
    return 'warning'
  }
  if (type === 'sys_user_sex' && value === '1') {
    return 'default'
  }
  if (type === 'sys_user_sex' && value === '2') {
    return 'info'
  }
  return 'secondary'
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDict(type: string) {
  return useQuery({
    queryKey: ['dict', type],
    queryFn: () => getDictDataByType(type),
    enabled: type.length > 0,
    staleTime: 5 * 60_000,
  })
}

export function DictTag({
  type,
  value,
}: {
  type: string
  value: string | number | null | undefined
}) {
  const { data } = useDict(type)
  const item = data?.find((entry) => entry.dictValue === String(value))

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>
  }
  const status = String(value)
  const variant = resolveDictBadgeVariant(type, status, item?.tagTone)
  return (
    <Badge variant={variant} data-tag-tone={item?.tagTone ?? 'NEUTRAL'}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {item?.dictLabel ?? status}
    </Badge>
  )
}
