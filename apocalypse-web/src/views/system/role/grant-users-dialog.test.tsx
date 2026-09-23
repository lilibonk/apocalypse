import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api/client'

import { GrantUsersDialog } from './index'

const { query, mutation, assigned, queryKeys } = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  assigned: {
    data: undefined as string[] | undefined,
    isSuccess: false,
    isFetching: true,
    isError: false,
  },
  queryKeys: [] as (readonly unknown[])[],
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: mutation,
}))
vi.mock('@/components/dyna', () => ({
  DynaPage: () => null,
  definePageSchema: (schema: unknown) => schema,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('.').slice(1).join('.') }),
}))
vi.mock('@/components/ui/dialog', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogHeader',
      'DialogTitle',
      'DialogDescription',
      'DialogFooter',
    ].map((name) => [name, Container]),
  )
})

const render = () =>
  renderToStaticMarkup(
    <GrantUsersDialog role={{ id: 'role-1', roleName: 'Role' }} onClose={vi.fn()} />,
  )
const saveButton = (html: string) => html.match(/<button\b[^>]*>保存<\/button>/)?.[0]

beforeEach(() => {
  Object.assign(assigned, { data: undefined, isSuccess: false, isFetching: true, isError: false })
  queryKeys.length = 0
  mutation.mockReset()
  mutation.mockReturnValue({ mutate: vi.fn(), isPending: false })
  query.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey.includes('grant')) {
      queryKeys.push(queryKey)
      return { ...assigned, error: new ApiError(-1, '第二页加载失败'), refetch: vi.fn() }
    }
    return {
      data: { list: [{ id: '1', username: 'visible', nickname: null }], total: 405 },
      isLoading: false,
      isFetching: false,
    }
  })
})

describe('role assignment replacement guard', () => {
  it('disables editing and saving until the complete assignment load succeeds', () => {
    const html = render()
    expect(saveButton(html)).toContain('disabled=""')
    expect(html.match(/<input\b[^>]*>/)?.[0]).toContain('disabled=""')
    const options = mutation.mock.calls.at(-1)?.[0] as { mutationFn: (ids: string[]) => unknown }
    expect(() => options.mutationFn([])).toThrow('完整加载')
  })

  it('shows an assigned-page failure and keeps saving disabled', () => {
    Object.assign(assigned, { isFetching: false, isError: true })
    const html = render()
    expect(html).toContain('第二页加载失败')
    expect(html).toContain('重试加载已分配用户')
    expect(saveButton(html)).toContain('disabled=""')
  })

  it('does not initialize from successful cached data while its fresh fetch is running', () => {
    Object.assign(assigned, { data: ['1'], isSuccess: true, isFetching: true })
    expect(saveButton(render())).toContain('disabled=""')
  })

  it('keeps assignments outside the visible page and enables save only after initialization', () => {
    Object.assign(assigned, { data: ['1', '405'], isSuccess: true, isFetching: false })
    const html = render()
    expect(html).toContain('已选 2 人（含其他页）')
    expect(html).toContain('checked=""')
    expect(saveButton(html)).not.toContain('disabled=""')
  })

  it('uses a new baseline query for every reopened dialog', () => {
    render()
    const first = queryKeys.at(-1)
    render()
    expect(queryKeys.at(-1)).not.toEqual(first)
  })
})
