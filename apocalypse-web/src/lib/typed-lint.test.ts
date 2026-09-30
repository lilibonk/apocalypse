import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint()
async function typedRules(code: string) {
  const [result] = await eslint.lintText(code, { filePath: 'src/lib/api/client.ts' })
  return result.messages.filter(
    (message) => message.ruleId?.startsWith('@typescript-eslint/') && message.severity === 2,
  )
}

describe('typed correctness gate', () => {
  it('rejects forgotten promises and promise predicates/void callbacks', async () => {
    expect(
      (await typedRules('export function run() { Promise.resolve(1) }')).map(
        (message) => message.ruleId,
      ),
    ).toContain('@typescript-eslint/no-floating-promises')
    const messages = await typedRules(
      'export function run() { [1].forEach(async () => { await Promise.resolve() }); if (Promise.resolve(true)) return 1 }',
    )
    expect(
      messages.filter((message) => message.ruleId === '@typescript-eslint/no-misused-promises'),
    ).toHaveLength(2)
  })
  it('requires real awaitables and Error throws', async () => {
    expect(
      (await typedRules("export async function run() { await 1; throw 'bad' }")).map(
        (message) => message.ruleId,
      ),
    ).toEqual(
      expect.arrayContaining([
        '@typescript-eslint/await-thenable',
        '@typescript-eslint/only-throw-error',
      ]),
    )
  })
  it('accepts awaited/caught failures and synchronous callbacks without weakening hooks/domain rules', async () => {
    expect(
      await typedRules(
        'export async function run() { await Promise.resolve(); void Promise.reject(new Error()).catch(() => {}); [1].forEach(() => {}); throw new Error() }',
      ),
    ).toEqual([])
  })
})
