import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

type Sources = Map<string, string>
const trustedBoundaries = new Set([
  'src/stores/auth.ts',
  'src/lib/query/ModuleAccess.tsx',
  'src/lib/query/use-module-mutation.ts',
  'src/lib/query/module-scope.ts',
  'src/lib/query/use-resource-denial.ts',
  'src/components/dyna/DynaPage.tsx',
  'src/components/dyna/use-dyna.ts',
])

function parse(path: string, text: string) {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function imports(source: ts.SourceFile) {
  return source.statements.flatMap((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.importClause?.isTypeOnly) return []
      const bindings = node.importClause?.namedBindings
      const names =
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements
              .filter((item) => !item.isTypeOnly)
              .map((item) => (item.propertyName ?? item.name).text)
          : ['*']
      return names.length ? [{ specifier: node.moduleSpecifier.text, names }] : []
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      const names =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements
              .filter((item) => !item.isTypeOnly)
              .map((item) => (item.propertyName ?? item.name).text)
          : ['*']
      return names.length ? [{ specifier: node.moduleSpecifier.text, names }] : []
    }
    return []
  })
}

function target(from: string, specifier: string, sources: Sources) {
  const base = specifier.startsWith('@/')
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(from), specifier))
      : specifier
  return (
    [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((path) =>
      sources.has(path),
    ) ?? base
  )
}

/** Supported import shapes are checked transitively, including aliases, namespaces and barrels. */
function audit(sources: Sources, roots: string[]) {
  const errors: string[] = []
  const parsed = new Map([...sources].map(([path, text]) => [path, parse(path, text)]))
  const reachesUnsafe = (path: string, seen = new Set<string>()): boolean => {
    if (path.endsWith('.queries.ts') || trustedBoundaries.has(path)) return false
    if (
      path === 'src/lib/api/client.ts' ||
      path === 'src/lib/query/access-lease.ts' ||
      path.endsWith('.api.ts')
    )
      return true
    if (seen.has(path)) return false
    seen.add(path)
    const source = parsed.get(path)
    if (!source) return false
    return imports(source).some(
      (edge) =>
        edge.specifier === 'axios' ||
        (edge.specifier === '@tanstack/react-query' &&
          edge.names.some((name) => name === 'useMutation' || name === '*')) ||
        reachesUnsafe(target(path, edge.specifier, sources), seen),
    )
  }
  for (const [path, source] of parsed) {
    if (!roots.some((root) => path.startsWith(`${root}/`))) continue
    const definition = path.endsWith('.queries.ts')
    const api = path.endsWith('.api.ts')
    const fail = (message: string) => errors.push(`${path}: ${message}`)
    const moduleMutations = new Set<string>()
    const queryHooks = new Set<string>()
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings))
        for (const binding of bindings.elements) {
          const imported = (binding.propertyName ?? binding.name).text
          if (
            imported === 'useModuleMutation' &&
            node.moduleSpecifier.text === '@/lib/query/use-module-mutation'
          )
            moduleMutations.add(binding.name.text)
          if (
            ['useQuery', 'useQueries'].includes(imported) &&
            node.moduleSpecifier.text === '@tanstack/react-query'
          )
            queryHooks.add(binding.name.text)
        }
    }
    if (!definition && !api)
      for (const edge of imports(source)) {
        if (
          edge.specifier === 'axios' ||
          (edge.specifier === '@tanstack/react-query' &&
            edge.names.some((name) => name === 'useMutation' || name === '*')) ||
          reachesUnsafe(target(path, edge.specifier, sources))
        )
          fail(`unscoped import: ${edge.specifier}`)
      }
    const guarded = (node: ts.Node): boolean => {
      let current: ts.Node | undefined = node
      while (current) {
        if (
          ts.isPropertyAssignment(current) &&
          ['onSuccess', 'onError', 'onSettled'].includes(current.name.getText(source))
        ) {
          const call = current.parent.parent
          return (
            ts.isCallExpression(call) &&
            ts.isIdentifier(call.expression) &&
            moduleMutations.has(call.expression.text)
          )
        }
        current = current.parent
      }
      return false
    }
    const calls: ts.CallExpression[] = []
    const scan = (node: ts.Node) => {
      if (ts.isCallExpression(node)) calls.push(node)
      ts.forEachChild(node, scan)
    }
    scan(source)
    const helperGuarded = (node: ts.Node): boolean => {
      let owner: ts.Node | undefined = node
      while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent
      if (
        !owner?.name ||
        owner.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      )
        return false
      const name = owner.name.text
      const callers = calls.filter(
        (call) => ts.isIdentifier(call.expression) && call.expression.text === name,
      )
      return callers.length > 0 && callers.every(guarded)
    }
    const walk = (node: ts.Node) => {
      if (
        !definition &&
        !api &&
        ts.isPropertyAssignment(node) &&
        ['queryKey', 'meta'].includes(node.name.getText(source))
      )
        fail('literal query ownership')
      if (ts.isBindingElement(node) && node.propertyName?.getText(source) === 'setQueryData')
        fail('aliased cache write')
      if (ts.isCallExpression(node)) {
        const expression = node.expression
        const name = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : ''
        if (['setQueryData', 'setQueriesData', 'mutateAsync', 'eval', 'fetch'].includes(name))
          fail('unguarded write/transport')
        if (ts.isIdentifier(expression) && moduleMutations.has(name)) {
          const options = node.arguments[1]
          if (
            !options ||
            !ts.isObjectLiteralExpression(options) ||
            !['localKey', 'onDenied'].every((key) =>
              options.properties.some((property) => property.name?.getText(source) === key),
            )
          )
            fail('mutation must bind local generation and object denial cleanup')
        }
        if (expression.kind === ts.SyntaxKind.ImportKeyword || name === 'require')
          fail('dynamic import escape')
        if (!definition && !api && ts.isIdentifier(expression) && queryHooks.has(name)) {
          const input = node.arguments[0]
          if (!input || !ts.isCallExpression(input))
            fail('query must consume its definition directly')
        }
        if (
          !definition &&
          !api &&
          ts.isPropertyAccessExpression(expression) &&
          (expression.expression.getText(source) === 'toast' ||
            ['createObjectURL', 'click'].includes(name)) &&
          !guarded(node) &&
          !helperGuarded(node)
        )
          fail('unguarded external effect')
        if (ts.isElementAccessExpression(expression)) {
          const argument = expression.argumentExpression
          if (
            !ts.isStringLiteral(argument) ||
            ['setQueryData', 'setQueriesData', 'mutateAsync'].includes(argument.text)
          )
            fail('computed operation escape')
        }
        if (api && ['request', 'rawRequest'].includes(name)) {
          const options = node.arguments[name === 'request' ? 1 : 2]
          if (
            !options ||
            !ts.isObjectLiteralExpression(options) ||
            !options.properties.some(
              (item) =>
                ts.isSpreadAssignment(item) && item.expression.getText(source) === 'transport',
            )
          )
            fail('API must forward captured transport')
        }
      }
      if (
        definition &&
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.endsWith('.api')
      )
        fail('API re-export escape')
      ts.forEachChild(node, walk)
    }
    walk(source)
    if (path.endsWith('/index.tsx')) {
      const contributesScope = source.statements.some(
        (node) =>
          ts.isExportDeclaration(node) &&
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.some((item) => item.name.text === 'queryScope'),
      )
      if (!contributesScope) fail('page must contribute its existing queryScope')
      if (!source.text.includes('<ModuleAccess')) fail('page must have an access boundary')
    }
  }
  return errors
}

function productionSources(): Sources {
  const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')
  const sources: Sources = new Map()
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === '__fixtures__') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.'))
        sources.set(`src/${relative(root, path)}`, readFileSync(path, 'utf8'))
    }
  }
  walk(root)
  return sources
}

describe('optional module source contract', () => {
  it('discovers single scope owners and enforces every production consumer', () => {
    const sources = productionSources()
    const owners = new Map<string, string>()
    for (const [path, text] of sources) {
      if (!path.startsWith('src/views/')) continue
      const source = parse(path, text)
      const walk = (node: ts.Node) => {
        if (ts.isNewExpression(node) && node.expression.getText(source) === 'ModuleScope') {
          const key = node.arguments?.[0]
          expect(path).toMatch(/\.queries\.ts$/)
          expect(key && ts.isStringLiteral(key)).toBe(true)
          const value = (key as ts.StringLiteral).text
          expect(value).toBe(path.split('/')[2])
          expect(owners.has(value)).toBe(false)
          owners.set(value, `src/views/${value}`)
        }
        ts.forEachChild(node, walk)
      }
      walk(source)
    }
    expect(owners.size).toBeGreaterThan(0)
    expect(audit(sources, [...owners.values()])).toEqual([])
  })

  it.each([
    "import {request as send} from '@/lib/api/client'; send('/secret')",
    "import * as transport from './barrel'; transport.send('/secret')",
    "import {send} from './barrel'; send('/secret')",
    "import {useMutation as write} from '@tanstack/react-query'; write({})",
    "import {useModuleMutation as write} from '@/lib/query/use-module-mutation'; write(scope,{localKey:'x'})",
    "import {useQuery as read} from '@tanstack/react-query'; read({queryKey:['probe'],meta:{moduleKey:'probe'}})",
    "const {setQueryData: write}=client; write(['secret'], data)",
    "client['set'+'QueryData'](['secret'],data)",
    'async function download(){const blob=await data; URL.createObjectURL(blob)}; download()',
    'const toast={success(){}}; Promise.resolve().then(()=>toast.success())',
    "import('./barrel').then(module=>module.send('/secret'))",
  ])('rejects an escape, including aliases and transitive re-exports: %s', (source) => {
    const sources: Sources = new Map([
      ['src/views/probe/page.tsx', source],
      ['src/views/probe/barrel.ts', "export {request as send} from '@/lib/api/client'"],
      ['src/lib/api/client.ts', 'export function request() {}'],
    ])
    expect(audit(sources, ['src/views/probe']).length).toBeGreaterThan(0)
  })
})
