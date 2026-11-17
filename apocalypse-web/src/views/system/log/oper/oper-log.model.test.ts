import { describe, expect, it } from 'vitest'

import { operLogCopy } from '../../i18n/oper-log'
import {
  buildOperStreamQuery,
  formatPayload,
  operTypeLabel,
  resolveOperTargetEntity,
  splitMaskedSegments,
  tokenizePayloadSegments,
} from './oper-log.model'

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

  it('splits masked segments, tokenizes JSON syntax, and builds causal stream queries', () => {
    const segments = splitMaskedSegments('{\n  "password": "******"\n}')
    expect(segments.some((s) => s.masked && s.text === '"******"')).toBe(true)

    const formattedJson =
      '{\n  "username": "admin",\n  "password": "******",\n  "status": 1,\n  "active": true,\n  "remark": null\n}'
    const tokens = tokenizePayloadSegments(formattedJson)
    expect(tokens.map((t) => t.text).join('')).toBe(formattedJson)
    expect(tokens.some((t) => t.kind === 'key' && t.text === '"username"')).toBe(true)
    expect(tokens.some((t) => t.kind === 'string' && t.text === '"admin"')).toBe(true)
    expect(tokens.some((t) => t.kind === 'masked' && t.masked && t.text === '"******"')).toBe(true)
    expect(tokens.some((t) => t.kind === 'number' && t.text === '1')).toBe(true)
    expect(tokens.some((t) => t.kind === 'boolean' && t.text === 'true')).toBe(true)
    expect(tokens.some((t) => t.kind === 'null' && t.text === 'null')).toBe(true)

    expect(tokenizePayloadSegments('io.apocalypse.Fixture.update()')).toEqual([
      { text: 'io.apocalypse.Fixture.update()', kind: 'plain', masked: false },
    ])

    expect(
      buildOperStreamQuery('角色', {
        range: 'WEEK',
        businessType: 'GRANT',
        status: 0,
      }),
    ).toEqual({
      keyword: '角色',
      businessType: 'GRANT',
      status: 0,
      range: 'WEEK',
    })

    expect(
      resolveOperTargetEntity({ title: '角色管理', method: 'RoleController.grant' })?.kind,
    ).toBe('role')
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
