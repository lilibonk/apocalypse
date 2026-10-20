/** Dev-only, in-memory API for the real dictionary workspace; never a production import. */
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { AppProviders } from '@/app/providers'
import { http } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import DictPage from '@/views/system/dict'
import type { DictTypeRow, DictValueRow } from '@/views/system/dict/dict-book.api'
import '@/index.css'

if (!import.meta.env.DEV) throw new Error('Dictionary fixture is dev-only')
useAuthStore.setState({
  tokens: null,
  user: { id: 'fixture', username: 'fixture', nickname: null },
  sessionEpoch: 1,
  authorizationEpoch: 1,
  meLoaded: true,
  bootstrapped: true,
  authorizationSnapshotId: 'dictionary-fixture',
  authorizationDeadline: Number.POSITIVE_INFINITY,
  perms: ['system:dict:list', 'system:dict:add', 'system:dict:edit', 'system:dict:remove'],
  allScopePerms: [],
  menus: [],
})
useSettingsStore.setState({ motionEnabled: false, language: 'zh', theme: 'light' })
let types: DictTypeRow[] = Array.from({ length: 13 }, (_, index) => ({
  id: `type-${index + 1}`,
  dictType: `fixture_${index + 1}`,
  dictName: `类型 ${index + 1}`,
  status: 1,
  remark: null,
}))
let values: DictValueRow[] = []
let serial = 100
http.defaults.adapter = async (config) => {
  const path = config.url ?? ''
  const query = (config.params ?? {}) as Record<string, unknown>
  const body = (typeof config.data === 'string' ? JSON.parse(config.data) : config.data) as
    Record<string, unknown> | undefined
  let data: unknown = null
  const page = (rows: unknown[]) => {
    const number = Number(query.page ?? 1),
      size = Number(query.size ?? 20)
    return {
      list: structuredClone(rows.slice((number - 1) * size, number * size)),
      total: rows.length,
      page: number,
      size,
    }
  }
  if (path === '/system/dict/types/page')
    data = page(
      types.filter(
        (row) =>
          !query.keyword || `${row.dictType} ${row.dictName}`.includes(String(query.keyword)),
      ),
    )
  else if (path === '/system/dict/types' && config.method === 'post') {
    const row: DictTypeRow = {
      id: `type-${++serial}`,
      dictType: String(body!.dictType),
      dictName: String(body!.dictName),
      status: 1,
      remark: null,
    }
    types = [...types, row]
    data = row.id
  } else if (path.startsWith('/system/dict/types/')) {
    const id = path.split('/').at(-1)!
    const current = types.find((row) => row.id === id)!
    if (config.method === 'delete') {
      types = types.filter((row) => row.id !== id)
      values = values.filter((row) => row.dictType !== current.dictType)
    } else if (config.method === 'put') {
      const next = { ...current, ...body } as DictTypeRow
      types = types.map((row) => (row.id === id ? next : row))
      values = values.map((row) =>
        row.dictType === current.dictType ? { ...row, dictType: next.dictType } : row,
      )
    } else throw new Error(`Unexpected dictionary method: ${config.method}`)
  } else if (path === '/system/dict/data/page')
    data = page(values.filter((row) => !query.dictType || row.dictType === query.dictType))
  else if (path.startsWith('/system/dict/data/type/'))
    data = structuredClone(
      values.filter(
        (row) => row.dictType === decodeURIComponent(path.split('/').at(-1)!) && row.status === 1,
      ),
    )
  else if (path === '/system/dict/data' && config.method === 'post') {
    const row: DictValueRow = {
      id: `value-${++serial}`,
      dictType: String(body!.dictType),
      dictLabel: String(body!.dictLabel),
      dictValue: String(body!.dictValue),
      status: 1,
      sort: 0,
      remark: null,
    }
    values = [...values, row]
    data = row.id
  } else if (path.startsWith('/system/dict/data/')) {
    const id = path.split('/').at(-1)!
    if (config.method === 'delete') values = values.filter((row) => row.id !== id)
    else if (config.method === 'put')
      values = values.map((row) => (row.id === id ? ({ ...row, ...body } as DictValueRow) : row))
    else throw new Error(`Unexpected dictionary method: ${config.method}`)
  } else throw new Error(`Unexpected dictionary request: ${path}`)
  return { status: 200, statusText: 'OK', headers: {}, config, data: { code: 0, data } }
}
createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <MemoryRouter>
      <DictPage />
    </MemoryRouter>
  </AppProviders>,
)
