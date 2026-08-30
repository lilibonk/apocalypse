/**
 * 操作日志（只读页，逃逸舱手写）：DynaSearch + DynaTable + 页面局部详情 Dialog。
 * 端点 GET /system/logs/oper?page&size&keyword（直接拼 query，无 /page 后缀）。
 * 状态列走字典 sys_common_status（成功 1 / 失败 0）；耗时列在行数据侧格式化为 `xx ms`。
 */

import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DynaSearch, DynaTable, type DynaColumn, type DynaSearchField } from '@/components/dyna'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { pageOperLogs, type OperLogRow } from './oper-log.api'

const DEFAULT_PAGE_SIZE = 10

const columns: DynaColumn[] = [
  { key: 'title', title: '操作模块' },
  { key: 'businessType', title: '操作类型' },
  { key: 'operName', title: '操作人' },
  { key: 'operIp', title: '操作 IP' },
  { key: 'costTimeText', title: '耗时' },
  {
    key: 'status',
    title: '操作状态',
    type: 'dict',
    dictType: 'sys_common_status',
    sticky: 'right',
  },
  { key: 'operTime', title: '操作时间', type: 'datetime', sticky: 'right' },
]

const searchFields: DynaSearchField[] = [
  { name: 'keyword', type: 'input', placeholder: '模块 / 操作人' },
]

/** 详情字段块：长 JSON 用 pre 折行展示，空值显示 -。 */
function DetailBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
        {value?.trim() ? value : '-'}
      </pre>
    </div>
  )
}

export default function OperLogPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({})
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<OperLogRow | null>(null)

  const keyword = appliedSearch.keyword ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['system', 'logs', 'oper', page, pageSize, keyword],
    queryFn: () => pageOperLogs(page, pageSize, keyword),
  })

  // DynaTable 文本列只做 String()，耗时 `xx ms` 的格式化在行数据侧完成（costTime → costTimeText）
  const rows = useMemo(
    () =>
      data?.list.map((row) => ({
        ...row,
        costTimeText: row.costTime === null ? null : `${row.costTime} ms`,
      })),
    [data],
  )

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {t('common.操作日志', { defaultValue: '操作日志' })}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('common.系统操作审计记录（只读）', { defaultValue: '系统操作审计记录（只读）' })}
        </p>
      </div>

      <DynaSearch
        fields={searchFields}
        values={draftSearch}
        onChange={(name, value) => setDraftSearch((draft) => ({ ...draft, [name]: value }))}
        onSearch={() => {
          setPage(1)
          setAppliedSearch({ ...draftSearch })
        }}
        onReset={() => {
          setDraftSearch({})
          setAppliedSearch({})
          setPage(1)
        }}
      />

      <DynaTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey="id"
        actions={(row) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('common.详情', { defaultValue: '详情' })}
            onClick={() => setDetail(row as OperLogRow)}
          >
            <Eye className="size-3.5" />
          </Button>
        )}
        page={page}
        size={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1)
          setPageSize(size)
        }}
      />

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('common.操作详情', { defaultValue: '操作详情' })}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.title ?? '-'} · ${detail.operName ?? '-'}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <DetailBlock
                label={t('common.请求方法', { defaultValue: '请求方法' })}
                value={detail.method}
              />
              <DetailBlock
                label={t('common.请求参数', { defaultValue: '请求参数' })}
                value={detail.operParam}
              />
              <DetailBlock
                label={t('common.返回结果', { defaultValue: '返回结果' })}
                value={detail.operResult}
              />
              <DetailBlock
                label={t('common.异常信息', { defaultValue: '异常信息' })}
                value={detail.errorMsg}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
