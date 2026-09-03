import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { compactLunarText } from './calendar.format'
import { calendarZh } from './i18n/zh'

const sources = import.meta.glob('./**/*.tsx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
describe('Calendar design-language guardrails', () => {
  it('does not reintroduce native select or native date popups in business components', () => {
    for (const [file, source] of Object.entries(sources).filter(
      ([file]) => !file.endsWith('.test.tsx'),
    )) {
      const tree = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const violations: string[] = []
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(tree)
          if (tag === 'select') violations.push('select')
          if (tag === 'input' || tag === 'Input') {
            for (const attr of node.attributes.properties) {
              if (
                ts.isJsxAttribute(attr) &&
                attr.name.getText(tree) === 'type' &&
                attr.initializer &&
                ts.isStringLiteral(attr.initializer) &&
                ['date', 'month', 'datetime-local'].includes(attr.initializer.text)
              )
                violations.push(attr.initializer.text)
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(tree)
      expect(violations, file).toEqual([])
      if (file.endsWith('/index.tsx') || file === './index.tsx')
        expect(source, file).toContain('CalendarPageFrame')
    }
  })
  it('uses understandable Chinese choices rather than wire enums', () => {
    const labels = [
      calendarZh.roles,
      calendarZh.publishModes,
      calendarZh.sourceClaims,
      calendarZh.assurances,
      calendarZh.overrideActions,
      calendarZh.conflictResolutions,
      calendarZh.layers,
      calendarZh.changes,
    ]
    for (const group of labels)
      for (const label of Object.values(group)) expect(label).not.toMatch(/[A-Z_]{3,}/)
  })
  it('shows compact lunar day names from supplied facts, including leap months', () => {
    const fact = {
      year: 2026,
      month: 7,
      day: 20,
      leapMonth: false,
      displayText: '二〇二六年七月二十',
    }
    expect(compactLunarText(fact)).toBe('二十')
    expect(compactLunarText({ ...fact, day: 1 })).toBe('七月')
    expect(compactLunarText({ ...fact, day: 1, leapMonth: true })).toBe('闰七月')
    expect(compactLunarText({ ...fact, day: 29 })).toBe('廿九')
    expect(compactLunarText(fact, 'en')).toBe('7/20')
    expect(compactLunarText(null)).toBe('')
  })
})
