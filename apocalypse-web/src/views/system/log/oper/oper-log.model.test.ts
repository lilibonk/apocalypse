import { describe, expect, it } from 'vitest'

import { operLogCopy } from '../../i18n/oper-log'
import { formatPayload, operTypeLabel } from './oper-log.model'

describe('operation payload formatting', () => {
  it('pretty-prints JSON objects and arrays', () => {
    expect(formatPayload('{"value":"light","id":"3"}')).toBe(
      '{\n  "value": "light",\n  "id": "3"\n}',
    )
    expect(formatPayload('[1,2]')).toBe('[\n  1,\n  2\n]')
  })

  it('keeps non-JSON and malformed text verbatim and treats blanks as empty', () => {
    expect(formatPayload('plain text')).toBe('plain text')
    expect(formatPayload('{broken')).toBe('{broken')
    expect(formatPayload('   ')).toBeNull()
    expect(formatPayload(null)).toBeNull()
  })
})

describe('operation type labels', () => {
  const t = (key: string, options?: Record<string, string>) =>
    `${key}${options ? JSON.stringify(options) : ''}`

  it('labels every known code and never shows a raw code as the label', () => {
    expect(operTypeLabel('UPDATE', t)).toBe('operLog.type.UPDATE')
    expect(operTypeLabel('SAVE_DRAFT', t)).toBe('operLog.type.SAVE_DRAFT')
    expect(operTypeLabel(null, t)).toBe('operLog.unrecorded')
    expect(operTypeLabel('', t)).toBe('operLog.unrecorded')
    expect(operTypeLabel('NEW_KIND', t)).toBe('operLog.other{"code":"NEW_KIND"}')
  })

  it('covers the same codes in both locales', () => {
    expect(Object.keys(operLogCopy.en.type).sort()).toEqual(Object.keys(operLogCopy.zh.type).sort())
  })
})
