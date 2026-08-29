/**
 * DynaDetail：描述展示（简单版）—— 字段 schema + 一条记录 → 对话框定义列表。
 * 复用 DynaColumn 描述展示字段（key/title/type/dictType）。
 */

import { DictTag } from '@/components/DictTag'
import { MotionSequence, MotionSequenceItem } from '@/components/motion/MotionSequence'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { DynaColumn } from './schema'
import { useDynaText } from './use-dyna'

export interface DynaDetailProps {
  title?: string
  description?: string
  fields: DynaColumn[]
  record: Record<string, unknown> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DetailValue({ field, record }: { field: DynaColumn; record: Record<string, unknown> }) {
  const raw = record[field.key]

  if (field.type === 'dict' && field.dictType) {
    return <DictTag type={field.dictType} value={raw as string | number | null | undefined} />
  }
  if (raw === null || raw === undefined || raw === '') {
    return <span className="text-muted-foreground">-</span>
  }
  if (field.type === 'datetime') {
    return <>{String(raw).replace('T', ' ').slice(0, 19)}</>
  }
  return <>{String(raw)}</>
}

export function DynaDetail({
  title,
  description,
  fields,
  record,
  open,
  onOpenChange,
}: DynaDetailProps) {
  const t = useDynaText()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <MotionSequence className="contents">
          <MotionSequenceItem>
            <DialogHeader>
              <DialogTitle>{t(title ?? '详情')}</DialogTitle>
              {description && <DialogDescription>{t(description)}</DialogDescription>}
            </DialogHeader>
          </MotionSequenceItem>
          {record && (
            <dl className="grid overflow-hidden rounded-lg border border-border sm:grid-cols-2">
              {fields.map((field) => (
                <MotionSequenceItem
                  key={field.key}
                  className="border-b border-border p-4 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(even)]:border-l"
                >
                  <dt className="text-xs text-muted-foreground">{t(field.title)}</dt>
                  <dd className="mt-1.5 min-w-0 break-all text-sm font-medium">
                    <DetailValue field={field} record={record} />
                  </dd>
                </MotionSequenceItem>
              ))}
            </dl>
          )}
        </MotionSequence>
      </DialogContent>
    </Dialog>
  )
}
