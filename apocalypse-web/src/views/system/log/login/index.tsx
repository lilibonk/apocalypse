/**
 * 登录日志（只读页，逃逸舱手写）：DynaSearch + DynaTable 组合。
 * 端点 GET /system/logs/login?page&size&keyword（直接拼 query，无 /page 后缀）。
 * 状态列走字典 sys_common_status（成功 1 / 失败 0）。
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
import { summarizeUserAgent } from '@/lib/user-agent'

import { pageLoginLogs, type LoginLogRow } from './login-log.api'

const DEFAULT_PAGE_SIZE = 10

const columns: DynaColumn[] = [
  { key: 'username', title: '用户名' },
  { key: 'ip', title: 'IP 地址' },
  { key: 'message', title: '提示消息' },
  { key: 'deviceSummary', title: '设备' },
  {
    key: 'success',
    title: '登录状态',
    type: 'dict',
    dictType: 'sys_common_status',
    sticky: 'right',
  },
  { key: 'loginTime', title: '登录时间', type: 'datetime', sticky: 'right' },
]

const searchFields: DynaSearchField[] = [
  { name: 'keyword', type: 'input', placeholder: '用户名 / IP' },
]

export default function LoginLogPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftSearch, setDraftSearch] = useState<Record<string, string>>({})
  const [appliedSearch, setAppliedSearch] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<LoginLogRow | null>(null)

  const keyword = appliedSearch.keyword ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['system', 'logs', 'login', page, pageSize, keyword],
    queryFn: () => pageLoginLogs(page, pageSize, keyword),
  })
  const rows = useMemo(
    () =>
      data?.list.map((row) => ({
        ...row,
        deviceSummary: summarizeUserAgent(row.userAgent),
      })),
    [data],
  )

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {t('common.登录日志', { defaultValue: '登录日志' })}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('common.系统登录成功与失败记录（只读）', {
            defaultValue: '系统登录成功与失败记录（只读）',
          })}
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
            onClick={() => setDetail(row as LoginLogRow)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>登录详情</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.username} · ${detail.ip ?? '未知 IP'}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">登录时间</dt>
                <dd className="mt-1 font-medium">{detail.loginTime.replace('T', ' ')}</dd>
              </div>
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">结果</dt>
                <dd className="mt-1 font-medium">{detail.message ?? '-'}</dd>
              </div>
              <div className="rounded-md border border-border p-3 sm:col-span-2">
                <dt className="text-muted-foreground">设备摘要</dt>
                <dd className="mt-1 font-medium">{summarizeUserAgent(detail.userAgent)}</dd>
              </div>
              <div className="rounded-md border border-border p-3 sm:col-span-2">
                <dt className="text-muted-foreground">原始 User Agent</dt>
                <dd className="mt-1 break-all font-mono text-xs">{detail.userAgent ?? '-'}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
