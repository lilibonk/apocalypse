import { describe, expect, it } from 'vitest'

import { buildI18nResources, type AppI18nModule } from './module-loader'

const core = {
  zh: { menu: { 工作台: '工作台' }, common: { save: '保存' } },
  en: { menu: { 工作台: 'Dashboard' }, common: { save: 'Save' } },
}

function pack(namespace = 'calendar'): AppI18nModule {
  return {
    namespace,
    resources: {
      zh: { title: '日历', nested: { save: '保存' } },
      en: { title: 'Calendar', nested: { save: 'Save' } },
    },
    menu: {
      zh: { 万年历: '万年历' },
      en: { 万年历: 'Calendar' },
    },
  }
}

describe('module i18n loader', () => {
  it('assembles deterministic namespaces and module-owned menu contributions', () => {
    const built = buildI18nResources(core, { '/calendar/i18n/index.ts': pack() })

    expect(built.namespaces).toEqual(['translation', 'calendar'])
    expect(built.resources.en?.calendar).toEqual({
      title: 'Calendar',
      nested: { save: 'Save' },
    })
    expect(built.resources.en?.translation?.menu).toEqual({
      工作台: 'Dashboard',
      万年历: 'Calendar',
    })
    expect(core.en.menu).toEqual({ 工作台: 'Dashboard' })
  })

  it('rejects duplicate namespaces and core menu collisions', () => {
    expect(() =>
      buildI18nResources(core, {
        '/a/i18n/index.ts': pack(),
        '/b/i18n/index.ts': pack(),
      }),
    ).toThrow('Duplicate i18n namespace')

    const conflicting = pack()
    conflicting.menu = {
      zh: { 工作台: '重复' },
      en: { 工作台: 'Duplicate' },
    }
    expect(() => buildI18nResources(core, { '/calendar/i18n/index.ts': conflicting })).toThrow(
      'Duplicate i18n menu key',
    )
  })

  it('rejects missing translations before application initialization', () => {
    const incomplete = pack()
    incomplete.resources.en = { title: 'Calendar' }

    expect(() => buildI18nResources(core, { '/calendar/i18n/index.ts': incomplete })).toThrow(
      'identical zh/en leaf keys',
    )
  })

  it('rejects reserved or malformed namespaces', () => {
    expect(() => buildI18nResources(core, { '/bad/i18n/index.ts': pack('translation') })).toThrow(
      'Invalid i18n namespace',
    )
    expect(() => buildI18nResources(core, { '/bad/i18n/index.ts': pack('Bad_Name') })).toThrow(
      'Invalid i18n namespace',
    )
  })
})
