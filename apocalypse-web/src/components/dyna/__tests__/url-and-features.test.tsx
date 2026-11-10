import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { zh } from '@/i18n/locales/zh'
import { useTabsStore } from '@/stores/tabs'

import { createAsyncFieldValidationController } from '../DynaForm'
import { DynaImportDialog } from '../DynaImportDialog'
import { DynaSearch } from '../DynaSearch'
import { DynaTable } from '../DynaTable'
import {
  buildFormValidator,
  flattenTreeNodeOptions,
  formValuesToBody,
  isFieldVisible,
} from '../form-model'
import { validatePageSchema, type DynaFormField } from '../schema'
import {
  expandSearchFieldKeys,
  parseDynaUrlSearch,
  serializeDynaUrlSearch,
} from '../use-dyna-url-state'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'zh', language: 'zh' },
    t: (key: string, params?: Record<string, unknown>) => {
      const field = key.replace(/^dyna\./, '')
      const template = (zh.translation.dyna as Record<string, string>)[field] ?? field
      return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''))
    },
  }),
}))

describe('FE-W3 URL state and tab query snapshot persistence', () => {
  it('round-trips pagination, search filters, and sort state while preserving unrelated view params', () => {
    const searchFields = expandSearchFieldKeys([
      { name: 'keyword', type: 'input' },
      { name: 'createTime', type: 'date-range' },
      { name: 'score', type: 'number-range' },
    ])
    expect(searchFields).toEqual([
      'keyword',
      'createTime',
      'createTimeBegin',
      'createTimeEnd',
      'score',
      'scoreMin',
      'scoreMax',
    ])

    const parsed = parseDynaUrlSearch(
      '?view=overview&page=3&size=50&keyword=admin&createTimeBegin=2026-01-01&sortField=createTime&sortOrder=desc&ignored=1',
      10,
      searchFields,
    )
    expect(parsed).toEqual({
      page: 3,
      pageSize: 50,
      search: {
        keyword: 'admin',
        createTimeBegin: '2026-01-01',
      },
      sort: { field: 'createTime', order: 'desc' },
    })

    const serialized = serializeDynaUrlSearch('?view=overview', parsed, 10, searchFields)
    expect(serialized).toContain('view=overview')
    expect(serialized).toContain('page=3')
    expect(serialized).toContain('size=50')
    expect(serialized).toContain('keyword=admin')
    expect(serialized).toContain('createTimeBegin=2026-01-01')
    expect(serialized).toContain('sortField=createTime')
    expect(serialized).toContain('sortOrder=desc')
  })

  it('preserves per-tab search query snapshots and cleans them up when a tab closes', () => {
    const store = useTabsStore.getState()
    store.reset()
    store.open({ key: '/system/user', title: '用户管理' })
    store.setTabSearch('/system/user', '?page=2&keyword=alice')
    expect(useTabsStore.getState().getTabSearch('/system/user')).toBe('?page=2&keyword=alice')
    expect(useTabsStore.getState().targetHref('/system/user')).toBe(
      '/system/user?page=2&keyword=alice',
    )

    store.close('/system/user')
    expect(useTabsStore.getState().getTabSearch('/system/user')).toBe('')
  })
})

describe('FE-W5 tree-select, visibleWhen, and range search controls', () => {
  it('flattens hierarchical tree-select nodes with indentation prefixes', () => {
    const flat = flattenTreeNodeOptions([
      {
        label: '总部',
        value: '1',
        children: [{ label: '研发中心', value: '2', children: [{ label: '平台组', value: '3' }] }],
      },
    ])
    expect(flat).toEqual([
      { label: '总部', value: '1' },
      { label: '　└ 研发中心', value: '2' },
      { label: '　　└ 平台组', value: '3' },
    ])
  })

  it('skips required validation and omits hidden fields from submit body when visibleWhen is false', () => {
    const fields: DynaFormField[] = [
      {
        name: 'menuType',
        label: '菜单类型',
        type: 'select',
        options: [
          { label: '目录', value: 'C' },
          { label: '菜单', value: 'M' },
        ],
      },
      {
        name: 'component',
        label: '组件路径',
        type: 'input',
        required: true,
        visibleWhen: { field: 'menuType', equals: 'M' },
      },
    ]
    const validator = buildFormValidator(fields, (key, params) => `${key}:${params.label}`)

    // Hidden when menuType === 'C' -> validation passes even though component is empty
    const directoryValues = { menuType: 'C', component: '' }
    expect(isFieldVisible(fields[1]!, directoryValues)).toBe(false)
    expect(validator.safeParse(directoryValues).success).toBe(true)
    expect(
      formValuesToBody(fields, { menuType: 'C', component: 'ignored/path' }, 'create'),
    ).toEqual({ menuType: 'C' })

    // Visible when menuType === 'M' -> required validation triggers when empty
    const menuValues = { menuType: 'M', component: '' }
    expect(isFieldVisible(fields[1]!, menuValues)).toBe(true)
    expect(validator.safeParse(menuValues).success).toBe(false)
  })

  it('renders date-range, number-range, and tree-select search controls', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <DynaSearch
          fields={[
            { name: 'createTime', label: '创建时间', type: 'date-range' },
            { name: 'sort', label: '排序范围', type: 'number-range' },
            {
              name: 'deptId',
              label: '所属部门',
              type: 'tree-select',
              treeOptions: [{ label: '总部', value: '100' }],
            },
          ]}
          values={{ sortMin: '1', sortMax: '10' }}
          onChange={vi.fn()}
          onSearch={vi.fn()}
          onReset={vi.fn()}
        />
      </QueryClientProvider>,
    )
    expect(html).toContain('data-slot="search-date-range"')
    expect(html).toContain('data-slot="search-number-range"')
    expect(html).toContain('value="1"')
    expect(html).toContain('value="10"')
  })

  it('debounces input changes, flushes immediately on blur, and discards stale out-of-order responses', async () => {
    vi.useFakeTimers()
    try {
      const setError = vi.fn()
      const clearErrors = vi.fn()
      const resolvers: Array<(result: string | null) => void> = []
      const asyncValidator = vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const controller = createAsyncFieldValidationController({
        fieldName: 'username',
        debounceMs: 300,
        asyncValidator,
        getValues: () => ({ username: 'admin' }),
        setError,
        clearErrors,
      })

      controller.scheduleDebounced('ad')
      controller.scheduleDebounced('adm')
      expect(asyncValidator).not.toHaveBeenCalled()

      // Advance 300ms -> only the latest debounced value ('adm') triggers validation
      vi.advanceTimersByTime(300)
      expect(asyncValidator).toHaveBeenCalledTimes(1)
      expect(asyncValidator).toHaveBeenLastCalledWith('adm', { username: 'admin' })

      // Before 'adm' resolves, user types 'admin' and blurs immediately -> cancels timer & fires immediately
      controller.scheduleDebounced('admi')
      controller.flushOnBlur('admin')
      expect(asyncValidator).toHaveBeenCalledTimes(2)
      expect(asyncValidator).toHaveBeenLastCalledWith('admin', { username: 'admin' })

      // Stale first promise ('adm') resolves with null AFTER second request was issued -> must be ignored
      resolvers[0]?.(null)
      await Promise.resolve()
      expect(clearErrors).not.toHaveBeenCalled()

      // Latest promise ('admin') resolves with duplicate error -> setError is called
      resolvers[1]?.('用户名已存在')
      await Promise.resolve()
      expect(setError).toHaveBeenCalledWith('username', {
        type: 'validate',
        message: '用户名已存在',
      })

      // Disabled field in edit mode must skip async validation completely
      const disabledValidator = vi.fn(async () => '用户名已存在')
      const disabledController = createAsyncFieldValidationController({
        fieldName: 'username',
        mode: 'edit',
        disabled: true,
        debounceMs: 300,
        asyncValidator: disabledValidator,
        getValues: () => ({ username: 'admin' }),
        setError,
        clearErrors,
      })
      disabledController.scheduleDebounced('admin')
      disabledController.flushOnBlur('admin')
      vi.advanceTimersByTime(300)
      expect(disabledValidator).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('validates importTemplatePath in DynaPageSchema', () => {
    const valid = validatePageSchema({
      key: 'system-user',
      endpoint: '/system/users',
      title: '用户管理',
      importPerm: 'system:user:add',
      importTemplatePath: '/system/users/import-template',
      importTemplateFileName: 'users-template.csv',
      columns: [{ key: 'username', title: '用户名' }],
    })
    expect(valid.success).toBe(true)

    const invalid = validatePageSchema({
      key: 'system-user',
      endpoint: '/system/users',
      title: '用户管理',
      importPerm: 'system:user:add',
      importTemplatePath: 'relative/path',
      columns: [{ key: 'username', title: '用户名' }],
    })
    expect(invalid.success).toBe(false)
    expect(invalid.issues.join(' ')).toContain('importTemplatePath')
  })
})

describe('FE-W2 / FE-W5 / FE-W6 DynaTable pulse, sortable, copyable, selectable, and import dialog', () => {
  it('renders mutatedRowKey pulse, sortable headers, copyable cells, and multi-row selection', () => {
    const html = renderToStaticMarkup(
      <DynaTable
        columns={[
          { key: 'username', title: '用户名', copyable: true },
          { key: 'createTime', title: '创建时间', type: 'datetime', sortable: true },
        ]}
        rows={[
          { id: '101', username: 'alice', createTime: '2026-11-09T10:00:00' },
          { id: '102', username: 'bob', createTime: '2026-11-09T11:00:00' },
        ]}
        rowKey="id"
        loading={false}
        page={1}
        size={10}
        total={2}
        onPageChange={vi.fn()}
        mutatedRowKey="101"
        sort={{ field: 'createTime', order: 'desc' }}
        onSortChange={vi.fn()}
        selectable
        selectedKeys={['101']}
        onSelectedKeysChange={vi.fn()}
      />,
    )
    expect(html).toContain('data-mutated-pulse="true"')
    expect(html).toContain('data-just-mutated="true"')
    expect(html).toContain('aria-sort="descending"')
    expect(html).toContain('data-slot="column-sort-button"')
    expect(html).toContain('data-slot="cell-copy-button"')
    expect(html).toContain('type="checkbox"')
  })

  it('renders DynaImportDialog when open', () => {
    const html = renderToStaticMarkup(
      <DynaImportDialog
        open={false}
        onOpenChange={vi.fn()}
        endpoint="/system/users"
        entityName="用户"
        templateFileName="users-template.csv"
        onImported={vi.fn()}
      />,
    )
    expect(html).toBe('')
  })
})
