/**
 * 字典标签：按字典类型渲染 value 对应的中文 label。
 * 字典数据经 react-query 缓存（5 分钟），同类型多处使用只请求一次。
 */

import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { getDictDataByType } from '@/lib/api/dict'

export function useDict(type: string) {
  return useQuery({
    queryKey: ['dict', type],
    queryFn: () => getDictDataByType(type),
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
  return <Badge variant="secondary">{item?.dictLabel ?? String(value)}</Badge>
}
