import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { appI18nResources } from '@/i18n/module-loader'
import { useAuthStore } from '@/stores/auth'
import { createDynaQueries } from '../dyna-queries'
import {
  definePageSchema,
  DynaDialogs,
  DynaTable,
  DynaToolbar,
  DynaToolbarActions,
  useDynaController,
} from '../index'

const testSchema = definePageSchema({
  key: 'test-configs',
  endpoint: '/system/configs',
  title: '参数配置',
  entityName: '参数',
  createPerm: 'system:config:add',
  search: [{ name: 'keyword', label: '关键词', type: 'input' }],
  columns: [
    { key: 'configName', title: '参数名称' },
    { key: 'configKey', title: '参数键名' },
  ],
  form: {
    fields: [
      { name: 'configName', label: '参数名称', type: 'input', required: true },
      { name: 'configKey', label: '参数键名', type: 'input', required: true },
    ],
  },
  rowActions: [{ kind: 'edit', perm: 'system:config:edit' }],
})

function HeadlessSpatialWorkspace() {
  const controller = useDynaController(testSchema, {
    entityIntent: { kind: 'config', id: '2', label: '主框架' },
  })
  return (
    <div>
      <span data-testid="selected-key">{controller.selectedRowKey ?? 'none'}</span>
      <span data-testid="can-add">{String(controller.permissions.canAdd)}</span>
      <DynaToolbarActions controller={controller} />
      <DynaToolbar controller={controller} presentation="toolbar" />
      <DynaTable {...controller.collection} />
      <DynaDialogs controller={controller} />
    </div>
  )
}

describe('Headless useDynaController & Composable Primitives', () => {
  it('mounts headless controller with EntityRouteIntent selection, permissions, and CRUD dialogs without DynaPage wrapper', async () => {
    Object.assign(useAuthStore.getInitialState(), {
      perms: ['system:config:add', 'system:config:edit'],
      allScopePerms: ['system:config:add', 'system:config:edit'],
    })
    useAuthStore.setState(useAuthStore.getInitialState())

    const i18n = createInstance()
    await i18n.init({
      lng: 'zh',
      resources: appI18nResources.resources,
      interpolation: { escapeValue: false },
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const listQuery = createDynaQueries(testSchema).list(
      {
        schemaKey: testSchema.key,
        endpoint: testSchema.endpoint,
        page: 1,
        size: 10,
        search: { keyword: '主框架' },
      },
      true,
    )
    client.setQueryData(listQuery.queryKey, {
      list: [
        { id: '1', configName: '初始密码', configKey: 'sys.user.initPassword' },
        { id: '2', configName: '主框架主题', configKey: 'sys.index.skinName' },
      ],
      total: 2,
      page: 1,
      size: 10,
    })

    try {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/system/config']}>
          <I18nextProvider i18n={i18n}>
            <QueryClientProvider client={client}>
              <TooltipProvider>
                <HeadlessSpatialWorkspace />
              </TooltipProvider>
            </QueryClientProvider>
          </I18nextProvider>
        </MemoryRouter>,
      )

      expect(html).toContain('<span data-testid="selected-key">2</span>')
      expect(html).toContain('<span data-testid="can-add">true</span>')
      expect(html).toContain('主框架主题')
      expect(html).toContain('新增参数')
    } finally {
      client.clear()
    }
  })
})
