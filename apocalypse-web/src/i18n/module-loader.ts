import { en } from './locales/en'
import { zh } from './locales/zh'

export const APP_LANGUAGES = ['zh', 'en'] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]
export type LocaleTree = { [key: string]: string | LocaleTree }

export interface AppI18nModule {
  namespace: string
  resources: Record<AppLanguage, LocaleTree>
  menu?: Record<AppLanguage, Record<string, string>>
}

type CoreResources = Record<AppLanguage, LocaleTree>
type DiscoveredModules = Record<string, AppI18nModule>
type AppResources = Record<AppLanguage, Record<string, LocaleTree>>

export interface BuiltI18nResources {
  namespaces: string[]
  resources: AppResources
}

export function buildI18nResources(
  core: CoreResources,
  discovered: DiscoveredModules,
): BuiltI18nResources {
  const resources: AppResources = {
    zh: { translation: cloneTree(core.zh) },
    en: { translation: cloneTree(core.en) },
  }
  const namespaces = new Set(['translation'])

  for (const [source, pack] of Object.entries(discovered).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    assertNamespace(pack.namespace, source)
    if (namespaces.has(pack.namespace)) {
      throw new Error(`Duplicate i18n namespace "${pack.namespace}" from ${source}`)
    }
    assertLeafParity(pack.resources.zh, pack.resources.en, `${pack.namespace} resources`)
    if (pack.menu) assertMenuParity(pack.menu, pack.namespace)

    namespaces.add(pack.namespace)
    for (const language of APP_LANGUAGES) {
      resources[language][pack.namespace] = cloneTree(pack.resources[language])
      if (pack.menu) mergeMenu(resources[language].translation, pack.menu[language], source)
    }
  }

  return { resources, namespaces: [...namespaces] }
}

function assertNamespace(namespace: string, source: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(namespace) || namespace === 'translation') {
    throw new Error(`Invalid i18n namespace "${namespace}" from ${source}`)
  }
}

function assertLeafParity(zhTree: LocaleTree, enTree: LocaleTree, label: string): void {
  const zhKeys = leafPaths(zhTree)
  const enKeys = leafPaths(enTree)
  if (zhKeys.join('\n') !== enKeys.join('\n')) {
    const zhOnly = zhKeys.filter((key) => !enKeys.includes(key))
    const enOnly = enKeys.filter((key) => !zhKeys.includes(key))
    throw new Error(
      `${label} must have identical zh/en leaf keys; zh-only=[${zhOnly.join(', ')}], en-only=[${enOnly.join(', ')}]`,
    )
  }
}

function assertMenuParity(
  menu: Record<AppLanguage, Record<string, string>>,
  namespace: string,
): void {
  const zhKeys = Object.keys(menu.zh).sort()
  const enKeys = Object.keys(menu.en).sort()
  if (zhKeys.join('\n') !== enKeys.join('\n')) {
    throw new Error(`${namespace} menu must have identical zh/en keys`)
  }
}

function leafPaths(tree: LocaleTree, prefix = ''): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(tree).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') paths.push(path)
    else paths.push(...leafPaths(value, path))
  }
  return paths
}

function cloneTree(tree: LocaleTree): LocaleTree {
  const clone: LocaleTree = {}
  for (const [key, value] of Object.entries(tree)) {
    clone[key] = typeof value === 'string' ? value : cloneTree(value)
  }
  return clone
}

function mergeMenu(translation: LocaleTree, contribution: Record<string, string>, source: string) {
  const existing = translation.menu
  if (typeof existing === 'string') throw new Error('Core i18n menu must be an object')
  const menu = existing ?? {}
  translation.menu = menu

  for (const [key, value] of Object.entries(contribution)) {
    if (Object.hasOwn(menu, key)) {
      throw new Error(`Duplicate i18n menu key "${key}" from ${source}`)
    }
    menu[key] = value
  }
}

const discoveredModules = import.meta.glob<AppI18nModule>('../views/**/i18n/index.ts', {
  eager: true,
  import: 'default',
})

export const appI18nResources = buildI18nResources(
  { zh: zh.translation, en: en.translation },
  discoveredModules,
)
