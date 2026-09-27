import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { zh } from '@/i18n/locales/zh'
import { ApiError } from '@/lib/api/client'

import { DynaSearch } from '../DynaSearch'
import { DynaTable, type DynaTableProps } from '../DynaTable'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const field = key.replace(/^dyna\./, '')
      const template = (zh.translation.dyna as Record<string, string>)[field] ?? field
      return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''))
    },
  }),
}))

const tableProps: DynaTableProps = {
  columns: [{ key: 'name', title: '名称' }],
  rows: undefined,
  rowKey: 'id',
  loading: false,
  page: 1,
  size: 10,
  total: 0,
  onPageChange: vi.fn(),
  onRetry: vi.fn(),
}
const renderTable = (props: Partial<DynaTableProps> = {}) =>
  renderToStaticMarkup(<DynaTable {...tableProps} {...props} />)
const renderSearch = (children: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
  )

describe('Dyna query feedback', () => {
  it('shows an initial failure and retry without claiming an empty result or a zero total', () => {
    const html = renderTable({ error: new ApiError(50000, '服务暂时不可用') })
    expect(html).toContain('role="alert"')
    expect(html).toContain('服务暂时不可用')
    expect(html).toContain('重试')
    expect(html).not.toContain('暂无数据')
    expect(html).not.toContain('共 0 条')
    expect(html).not.toContain('上一页')
  })

  it('retains a successful page after a failed refresh and explains its freshness', () => {
    const html = renderTable({
      rows: [{ id: 'one', name: '上次加载的记录' }],
      total: 1,
      error: new ApiError(50000, '刷新请求失败'),
    })
    expect(html).toContain('上次加载的记录')
    expect(html).toContain('当前显示上次成功加载的数据。')
    expect(html).toContain('共 1 条')
    expect(html).not.toContain('暂无数据')
  })

  it.each([403, 40300, 404, 40400])('never renders cached records after denial %s', (code) => {
    const html = renderTable({
      rows: [{ id: 'private', name: '不得再展示的记录' }],
      total: 1,
      error: new ApiError(code, '当前无权访问'),
    })
    expect(html).toContain('当前数据不可访问')
    expect(html).not.toContain('不得再展示的记录')
    expect(html).not.toContain('共 1 条')
    expect(html).not.toContain('上次成功')
  })

  it('distinguishes filtered no-results from the successful empty dataset', () => {
    const filtered = renderTable({ rows: [], filtered: true, onResetFilters: vi.fn() })
    expect(filtered).toContain('没有匹配的结果')
    expect(filtered).toContain('清除筛选')
    expect(filtered).not.toContain('暂无数据')

    const empty = renderTable({ rows: [] })
    expect(empty).toContain('暂无数据')
    expect(empty).not.toContain('清除筛选')
  })

  it('keeps a known empty dataset identified when only its refresh fails', () => {
    const html = renderTable({ rows: [], error: new ApiError(50000, '网络暂时中断') })
    expect(html).toContain('当前显示上次成功加载的数据。')
    expect(html).toContain('暂无数据')
  })

  it('disables retry while a retry request is running', () => {
    const html = renderTable({ error: new ApiError(50000, '请求失败'), refreshing: true })
    expect(html).toMatch(/<button\b[^>]*disabled=""[^>]*>/)
    expect(html).toContain('重试中…')
  })
})

describe('Dyna search labels', () => {
  it('keeps the semantic label linked to the input after a value has been entered', () => {
    const html = renderSearch(
      <DynaSearch
        fields={[{ name: 'keyword', label: '用户名 / 昵称', type: 'input' }]}
        values={{ keyword: 'Morgan' }}
        onChange={vi.fn()}
        onSearch={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const inputId = html.match(/<input\b[^>]*\bid="([^"]+)"/)?.[1]
    expect(inputId).toBeDefined()
    expect(html).toContain(`for="${inputId}"`)
    expect(html).toContain('用户名 / 昵称</label>')
    expect(html).toContain('value="Morgan"')
    expect(html).not.toContain('aria-label="keyword"')
  })

  it('uses meaningful fallback copy instead of an internal parameter name', () => {
    const html = renderSearch(
      <DynaSearch
        fields={[{ name: 'internal_search_argument', type: 'input' }]}
        values={{}}
        onChange={vi.fn()}
        onSearch={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(html).toContain('关键词</label>')
    expect(html).not.toContain('aria-label="internal_search_argument"')
  })
})
