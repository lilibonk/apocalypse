import { describe, expect, it } from 'vitest'
import { permissionMetadataBody } from './permission.model'
describe('permission definition metadata boundary', () => {
  it('passes only allowed metadata with its expected version', () => {
    expect(
      permissionMetadataBody(
        {
          name: ' Read users ',
          description: 'description',
          status: 0,
          lifecycle: 'DEPRECATED',
          code: 'injected',
          moduleKey: 'other',
          action: 'execute',
          supportedScopeOverrides: ['ALL'],
          registered: true,
        },
        3,
      ),
    ).toEqual({
      expectedVersion: 3,
      name: 'Read users',
      description: 'description',
      status: 0,
      lifecycle: 'DEPRECATED',
    })
  })
  it.each([undefined, null, '3', NaN, Infinity, -1, 1.5])(
    'rejects absent or invalid version %s',
    (version) => expect(() => permissionMetadataBody({}, version)).toThrow('未完整加载'),
  )
})
