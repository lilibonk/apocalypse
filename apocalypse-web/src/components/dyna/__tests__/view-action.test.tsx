import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { appI18nResources } from '@/i18n/module-loader'

import { DynaPage } from '../DynaPage'
import { createDynaQueries } from '../dyna-queries'
import type { DynaPageSchema } from '../schema'

describe('Dyna default view action', () => {
  it.each([
    ['en', 'View'],
    ['zh', '查看'],
  ])('uses the existing common label in %s', async (language, label) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      resources: appI18nResources.resources,
      interpolation: { escapeValue: false },
    })
    const client = new QueryClient()
    const schema: DynaPageSchema = {
      key: 'users',
      endpoint: '/system/users',
      title: 'Users',
      columns: [{ key: 'username', title: 'Username' }],
      rowActions: [{ kind: 'view' }],
    }
    const options = createDynaQueries(schema).list(
      { schemaKey: schema.key, endpoint: schema.endpoint, page: 1, size: 10, search: {} },
      true,
    )
    client.setQueryData(options.queryKey, {
      list: [{ id: '1', username: 'Morgan' }],
      total: 1,
      page: 1,
      size: 10,
    })
    try {
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={client}>
            <TooltipProvider>
              <DynaPage schema={schema} />
            </TooltipProvider>
          </QueryClientProvider>
        </I18nextProvider>,
      )
      expect(html).toContain(`aria-label="${label}"`)
      if (language === 'en') expect(html).not.toContain('aria-label="查看"')
    } finally {
      client.clear()
    }
  })
  it('resolves shared navigation and dialog labels from the assembled English resources', async () => {
    const i18n = createInstance()
    await i18n.init({ lng: 'en', resources: appI18nResources.resources })
    const labels = {
      打开导航: 'Open navigation',
      关闭: 'Close',
      展开侧边栏: 'Expand sidebar',
      收起侧边栏: 'Collapse sidebar',
      菜单: 'Menus',
      已打开页面: 'Open pages',
      工作台: 'Dashboard',
      外观实验室: 'Appearance lab',
    }
    for (const [key, value] of Object.entries(labels)) {
      expect(i18n.t(`common.${key}`, { defaultValue: key })).toBe(value)
    }
  })
})
