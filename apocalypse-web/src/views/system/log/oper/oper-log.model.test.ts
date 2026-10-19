import { describe, expect, it } from 'vitest'

import { formatPayload } from './oper-log.model'

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
