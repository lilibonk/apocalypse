import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { chromium, expect, test, type Locator, type Page } from '@playwright/test'

interface DeploymentCheckpoint {
  origin: string
  candidateManifestSha256: string
  sourceContentSha256: string
  credentialsFile: string
  chromiumSpkiSha256: string
  completionFile: string
  accessTtlSeconds: number
  effectiveExpiresIn: number
  rehearsalOverrideSha256: string
}
interface Credentials {
  username: string
  password: string
}
const completed: { name: string; result: 'passed' }[] = []
const observations: { check: string; path: string; status: number }[] = []
let checkpoint: DeploymentCheckpoint
let credentials: Credentials

test.beforeAll(async () => {
  const checkpointFile = process.env.APOCALYPSE_BROWSER_CHECKPOINT
  if (!checkpointFile) throw new Error('A source-bound deployment checkpoint is required')
  checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8')) as DeploymentCheckpoint
  if (!/^[a-f0-9]{64}$/.test(checkpoint.candidateManifestSha256))
    throw new Error('Checkpoint lacks a candidate manifest hash')
  const metadata = await stat(checkpoint.credentialsFile)
  if ((metadata.mode & 0o777) !== 0o600) throw new Error('Test credentials must be private')
  credentials = JSON.parse(await readFile(checkpoint.credentialsFile, 'utf8')) as Credentials
  if (!credentials.username || !credentials.password) throw new Error('Test credentials missing')
})

test.afterAll(async () => {
  if (completed.length !== 5 || !checkpoint) return
  const output = {
    result: 'passed',
    origin: checkpoint.origin,
    candidateManifestSha256: checkpoint.candidateManifestSha256,
    sourceContentSha256: checkpoint.sourceContentSha256,
    checks: completed,
    observations,
  }
  const temporary = `${checkpoint.completionFile}.tmp`
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, checkpoint.completionFile)
})

function endpoint(response: { url(): string }, suffix: string): boolean {
  return new URL(response.url()).pathname === `/api${suffix}`
}

/** Do not place password values in Playwright fill action metadata or propagated errors. */
async function fillPassword(field: Locator, password: string): Promise<void> {
  try {
    const accepted = await field.evaluate((element, value) => {
      if (!(element instanceof HTMLInputElement)) return false
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (!setValue) return false
      setValue.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return element.value === value
    }, password)
    if (!accepted) throw new Error('Password input unavailable')
  } catch {
    throw new Error('Password input failed')
  }
}

async function login(page: Page, account = credentials): Promise<string> {
  await page.goto('/login')
  await page.getByLabel('用户名', { exact: true }).fill(account.username)
  await fillPassword(page.getByLabel('密码', { exact: true }), account.password)
  const response = page.waitForResponse((value) => endpoint(value, '/auth/browser/login'))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const envelope: unknown = await (await response).json()
  if (!envelope || typeof envelope !== 'object' || !('data' in envelope))
    throw new Error('Browser login must return an R envelope')
  const data = envelope.data
  if (
    !data ||
    typeof data !== 'object' ||
    !('accessToken' in data) ||
    typeof data.accessToken !== 'string' ||
    'refreshToken' in data
  )
    throw new Error('Browser login must return access only')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('button', { name: /^账户菜单：/ })).toBeVisible()
  return data.accessToken
}

async function saveDialog(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name, exact: true })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
}

/** Exercise normal SPA navigation rather than generating a cookie bootstrap for each page. */
async function navigate(page: Page, path: string): Promise<void> {
  const names: Record<string, string> = {
    '/system/user': '用户管理',
    '/system/role': '角色管理',
    '/system/dept': '部门管理',
    '/system/online': '在线用户',
  }
  const link = page.getByRole('link', { name: names[path], exact: true })
  if (!(await link.isVisible()))
    await page
      .getByRole('button', {
        name: path === '/system/online' ? '日志管理' : '系统管理',
        exact: true,
      })
      .click()
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
}

async function search(page: Page, label: string, keyword: string): Promise<Locator> {
  await page.getByRole('textbox', { name: label, exact: true }).fill(keyword)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: keyword, exact: true }) })
  await expect(row).toBeVisible()
  return row
}

async function removeRow(page: Page, row: Locator): Promise<void> {
  await row.getByRole('button', { name: '删除', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: '确认删除', exact: true })
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(row).toBeHidden()
}

async function grantUserMenu(page: Page, roleRow: Locator, selected: boolean): Promise<void> {
  await roleRow.getByRole('button', { name: '菜单授权', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '菜单授权', exact: true })
  await dialog.getByRole('textbox', { name: '搜索菜单与操作', exact: true }).fill('用户管理')
  await dialog.getByRole('checkbox', { name: '用户管理', exact: true }).setChecked(selected)
  await dialog.getByRole('button', { name: '查看变更并继续', exact: true }).click()
  await dialog.getByRole('button', { name: '确认并保存', exact: true }).click()
  await expect(dialog).toBeHidden()
}

test('temporary certificate pin accepts its origin and a wrong pin is rejected', async ({
  page,
  baseURL,
}) => {
  expect(baseURL).toBe(checkpoint.origin)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  const wrong = await chromium.launch({
    args: [`--ignore-certificate-errors-spki-list=${randomBytes(32).toString('base64')}`],
  })
  try {
    const context = await wrong.newContext({ ignoreHTTPSErrors: false })
    const untrusted = await context.newPage()
    let rejection = ''
    try {
      await untrusted.goto(`${checkpoint.origin}/login`)
    } catch (error) {
      rejection = error instanceof Error ? error.message : ''
    }
    expect(rejection.includes('ERR_CERT_AUTHORITY_INVALID')).toBe(true)
  } finally {
    await wrong.close()
  }
  completed.push({ name: 'TLS matching leaf SPKI accepted; wrong SPKI rejected', result: 'passed' })
})

test('Secure cookie, CSRF rejection, reload and serialized two-tab refresh/logout', async ({
  page,
  context,
  browser,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem(
      'apocalypse.auth',
      JSON.stringify({
        state: {
          tokens: { accessToken: 'obsolete-local-marker', refreshToken: 'obsolete-refresh-marker' },
        },
        version: 0,
      }),
    )
  })
  const access = await login(page)
  const refresh = (await context.cookies()).find(
    (cookie) => cookie.name === '__Host-apocalypse-refresh',
  )
  if (!refresh) throw new Error('Secure host refresh cookie missing')
  expect({
    httpOnly: refresh.httpOnly,
    secure: refresh.secure,
    sameSite: refresh.sameSite,
    path: refresh.path,
  }).toEqual({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' })
  expect(refresh.domain.startsWith('.')).toBe(false)
  const storage = await page.evaluate(
    (token) => ({
      legacyRemoved: localStorage.getItem('apocalypse.auth') === null,
      accessAbsent: [...Object.values(localStorage), ...Object.values(sessionStorage)].every(
        (value) => !value.includes(token) && !value.includes('obsolete-refresh-marker'),
      ),
      refreshUnreadable: !document.cookie.includes('__Host-apocalypse-refresh='),
    }),
    access,
  )
  expect(storage).toEqual({ legacyRemoved: true, accessAbsent: true, refreshUnreadable: true })

  // Only the rejection code returns to Node; response credentials never enter test artifacts.
  for (const violation of ['csrf', 'origin', 'fetch-metadata'] as const) {
    await page.route('**/api/auth/browser/refresh', async (route) => {
      const headers = { ...route.request().headers() }
      if (violation === 'csrf') delete headers['x-xsrf-token']
      if (violation === 'origin') headers.origin = 'https://not-approved.invalid'
      if (violation === 'fetch-metadata') headers['sec-fetch-site'] = 'cross-site'
      await route.continue({ headers })
    })
    const code = await page.evaluate(async () => {
      const csrf =
        document.cookie
          .split('; ')
          .find((part) => part.startsWith('XSRF-TOKEN='))
          ?.slice('XSRF-TOKEN='.length) ?? ''
      const response = await fetch('/api/auth/browser/refresh', {
        method: 'POST',
        headers: { 'X-XSRF-TOKEN': decodeURIComponent(csrf) },
      })
      const body: unknown = await response.json()
      return body && typeof body === 'object' && 'code' in body ? body.code : response.status
    })
    expect(code === 40300 || code === 403).toBe(true)
    await page.unroute('**/api/auth/browser/refresh')
  }
  const reloadRefresh = page.waitForResponse((response) =>
    endpoint(response, '/auth/browser/refresh'),
  )
  await page.reload()
  await reloadRefresh
  await expect(page.getByRole('button', { name: /^账户菜单：/ })).toBeVisible()
  expect(
    (await context.cookies()).find((cookie) => cookie.name === refresh.name)?.value ===
      refresh.value,
  ).toBe(false)

  const second = await context.newPage()
  await second.goto('/dashboard')
  await expect(second.getByRole('button', { name: /^账户菜单：/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^账户菜单：/ })).toBeVisible()
  let active = 0
  let peak = 0
  let finished = 0
  const pending = new Set<object>()
  context.on('request', (request) => {
    if (!endpoint(request, '/auth/browser/refresh')) return
    pending.add(request)
    active++
    peak = Math.max(peak, active)
  })
  context.on('response', (response) => {
    if (!pending.delete(response.request())) return
    active--
    finished++
  })
  context.on('requestfailed', (request) => {
    if (!pending.delete(request)) return
    active--
  })
  await Promise.all([
    page.evaluate(() => window.dispatchEvent(new Event('focus'))),
    second.evaluate(() => window.dispatchEvent(new Event('focus'))),
  ])
  await expect.poll(() => finished).toBeGreaterThanOrEqual(2)
  expect(peak).toBe(1)
  await expect(page.getByRole('button', { name: /^账户菜单：/ })).toBeVisible()
  await expect(second.getByRole('button', { name: /^账户菜单：/ })).toBeVisible()
  await page.getByRole('button', { name: /^账户菜单：/ }).click()
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(second).toHaveURL(/\/login$/)
  expect((await context.cookies()).some((cookie) => cookie.name === refresh.name)).toBe(false)

  const invalid = await browser.newContext({
    baseURL: checkpoint.origin,
    ignoreHTTPSErrors: false,
  })
  try {
    const tab = await invalid.newPage()
    await login(tab)
    await navigate(tab, '/system/user')
    await expect(tab.getByRole('cell', { name: credentials.username, exact: true })).toBeVisible()
    const currentCookie = (await invalid.cookies()).find((cookie) => cookie.name === refresh.name)
    if (!currentCookie) throw new Error('Invalid-cookie fixture lacks initial refresh cookie')
    const marker = 'invalid-refresh-cookie-fixture'
    await invalid.addCookies([{ ...currentCookie, value: marker }])
    const denied = tab.waitForResponse((value) => endpoint(value, '/auth/browser/logout'))
    await tab.getByRole('button', { name: /^账户菜单：/ }).click()
    await tab.getByRole('menuitem', { name: '退出登录', exact: true }).click()
    const denial: unknown = await (await denied).json()
    expect(
      Boolean(denial && typeof denial === 'object' && 'code' in denial && denial.code === 40100),
    ).toBe(true)
    await expect(tab).toHaveURL(/\/login$/)
    await expect(tab.getByRole('cell', { name: credentials.username, exact: true })).toHaveCount(0)
    // A failed logout clears this tab only, without a deletion response racing a shared winner.
    expect(
      (await invalid.cookies()).find((cookie) => cookie.name === refresh.name)?.value === marker,
    ).toBe(true)
  } finally {
    await invalid.close()
  }
  completed.push({
    name: 'Secure HttpOnly Strict cookie; CSRF/Origin/FetchMetadata; reload and two-tab refresh/logout; invalid-cookie logout clears local identity only',
    result: 'passed',
  })
})

test('actual department CRUD, missed broadcast recovery, permission withdrawal and forced logout', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180_000)
  await login(page)
  const suffix = randomUUID().slice(0, 8)
  const department = `Browser department ${suffix}`
  const roleName = `Browser role ${suffix}`
  const username = `browser_${suffix}`
  const password = `Test1!${randomUUID()}`
  await navigate(page, '/system/dept')
  await page.getByRole('button', { name: '新增部门', exact: true }).click()
  await page
    .getByRole('dialog', { name: '新增部门', exact: true })
    .getByRole('textbox', { name: '部门名称', exact: true })
    .fill(department)
  await saveDialog(page, '新增部门')
  await expect(page.getByRole('cell', { name: department, exact: true })).toBeVisible()

  await navigate(page, '/system/role')
  await page.getByRole('button', { name: '新增角色', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '新增角色', exact: true })
  await dialog.getByRole('textbox', { name: '角色名称' }).fill(roleName)
  await dialog.getByRole('textbox', { name: '角色标识' }).fill(`browser_role_${suffix}`)
  await expect(dialog.getByRole('combobox', { name: '数据范围', exact: true })).toHaveText('本部门')
  await saveDialog(page, '新增角色')
  let roleRow = await search(page, '角色名称 / 标识', roleName)
  await expect(roleRow.getByRole('cell', { name: '本部门', exact: true })).toBeVisible()
  await roleRow.getByRole('button', { name: '编辑', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '编辑角色', exact: true })
  await dialog.getByRole('combobox', { name: '数据范围', exact: true }).click()
  await page.getByRole('option', { name: '本部门及下级部门', exact: true }).click()
  await saveDialog(page, '编辑角色')
  await expect(roleRow.getByRole('cell', { name: '本部门及下级部门', exact: true })).toBeVisible()

  await navigate(page, '/system/user')
  const createOptions = page.waitForResponse(
    (response) =>
      endpoint(response, '/system/users/department-options') &&
      new URL(response.url()).searchParams.get('operation') === 'CREATE',
  )
  await page.getByRole('button', { name: '新增用户', exact: true }).click()
  await createOptions
  dialog = page.getByRole('dialog', { name: '新增用户', exact: true })
  await dialog.getByRole('textbox', { name: '用户名' }).fill(username)
  await fillPassword(dialog.getByLabel('密码', { exact: false }), password)
  await dialog.getByRole('textbox', { name: '昵称', exact: true }).fill(`Browser user ${suffix}`)
  await dialog.getByRole('combobox', { name: '部门', exact: true }).click()
  await page.getByRole('option', { name: department, exact: true }).click()
  await saveDialog(page, '新增用户')
  const userRow = await search(page, '用户名 / 昵称', username)
  await expect(userRow.getByRole('cell', { name: department, exact: true })).toBeVisible()
  const updateOptions = page.waitForResponse(
    (response) =>
      endpoint(response, '/system/users/department-options') &&
      new URL(response.url()).searchParams.get('operation') === 'UPDATE',
  )
  await userRow.getByRole('button', { name: '编辑', exact: true }).click()
  await updateOptions
  dialog = page.getByRole('dialog', { name: '编辑用户', exact: true })
  await dialog.getByRole('combobox', { name: '部门', exact: true }).click()
  await page.getByRole('option', { name: '未选择', exact: true }).click()
  await saveDialog(page, '编辑用户')
  await expect(userRow.getByRole('cell', { name: department, exact: true })).toBeVisible()

  await navigate(page, '/system/role')
  roleRow = await search(page, '角色名称 / 标识', roleName)
  await grantUserMenu(page, roleRow, true)
  await roleRow.getByRole('button', { name: '分配用户', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '分配用户', exact: true })
  await expect(dialog.getByRole('checkbox').first()).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  const candidate = dialog.getByRole('checkbox', { name: new RegExp(`^${username}\\b`) })
  for (let attempt = 0; attempt < 10 && !(await candidate.isVisible()); attempt++) {
    const next = dialog.getByRole('button', { name: '下一页', exact: true })
    await expect(next).toBeEnabled()
    await next.click()
  }
  await candidate.check()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()

  await navigate(page, '/system/user')
  await search(page, '用户名 / 昵称', credentials.username)
  const second = await context.newPage()
  // Deliberately miss the broadcast in this tab; restoration must still rebind the shared cookie.
  await second.addInitScript(() =>
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined }),
  )
  await login(second, { username, password })
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  )
  await expect(
    page.getByRole('button', { name: `账户菜单：Browser user ${suffix}`, exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('cell', { name: credentials.username, exact: true })).toHaveCount(0)
  await search(page, '用户名 / 昵称', username)

  const administrator = await browser.newContext({
    baseURL: checkpoint.origin,
    ignoreHTTPSErrors: false,
  })
  try {
    const admin = await administrator.newPage()
    await login(admin)
    await navigate(admin, '/system/role')
    roleRow = await search(admin, '角色名称 / 标识', roleName)
    await grantUserMenu(admin, roleRow, false)
    const observePermission = (response: { url(): string; status(): number }) => {
      const path = new URL(response.url()).pathname
      if (
        ['/api/system/users/page', '/api/system/users/me', '/api/auth/browser/refresh'].includes(
          path,
        )
      )
        observations.push({ check: 'permission withdrawal', path, status: response.status() })
    }
    page.on('response', observePermission)
    const renewedPermissions = page.waitForResponse(
      (response) => endpoint(response, '/system/users/me') && response.status() === 200,
    )
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    )
    await renewedPermissions
    page.off('response', observePermission)
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('link', { name: '用户管理', exact: true })).toHaveCount(0)
    await expect(page.getByRole('cell', { name: username, exact: true })).toHaveCount(0)

    await login(second, { username, password })
    await navigate(admin, '/system/online')
    const onlineRow = admin
      .getByRole('row')
      .filter({ has: admin.getByRole('cell', { name: username, exact: true }) })
      .first()
    await onlineRow.getByRole('button', { name: '强退', exact: true }).click()
    const confirmation = admin.getByRole('alertdialog', { name: '确认强退', exact: true })
    await confirmation.getByRole('button', { name: '确认强退', exact: true }).click()
    await expect(confirmation).toBeHidden()
    const deniedRefresh = second.waitForResponse((response) =>
      endpoint(response, '/auth/browser/refresh'),
    )
    await second.evaluate(() => window.dispatchEvent(new Event('focus')))
    const deniedBody: unknown = await (await deniedRefresh).json()
    expect(
      Boolean(
        deniedBody &&
        typeof deniedBody === 'object' &&
        'code' in deniedBody &&
        deniedBody.code === 40100,
      ),
    ).toBe(true)
    await expect(second).toHaveURL(/\/login$/)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page).toHaveURL(/\/login$/)

    await navigate(admin, '/system/user')
    await removeRow(admin, await search(admin, '用户名 / 昵称', username))
    await navigate(admin, '/system/role')
    roleRow = await search(admin, '角色名称 / 标识', roleName)
    await removeRow(admin, roleRow)
    await navigate(admin, '/system/dept')
    await removeRow(
      admin,
      admin
        .getByRole('row')
        .filter({ has: admin.getByRole('cell', { name: department, exact: true }) }),
    )
  } finally {
    await administrator.close()
  }
  completed.push({
    name: 'Actual role/department CRUD; missed-broadcast restore; account cache reset; permission withdrawal; persistent forced logout',
    result: 'passed',
  })
})

test('an actually expired access token refreshes from cookie and retries a protected browser query', async ({
  page,
}) => {
  test.setTimeout(200_000)
  expect(checkpoint.accessTtlSeconds).toBe(60)
  expect(checkpoint.effectiveExpiresIn).toBe(60)
  await login(page)
  await navigate(page, '/system/user')
  await expect(page.getByRole('button', { name: '刷新数据', exact: true })).toBeVisible()
  const rotation = page.waitForResponse((response) => endpoint(response, '/auth/browser/refresh'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const response: unknown = await (await rotation).json()
  if (!response || typeof response !== 'object' || !('data' in response))
    throw new Error('Rotation envelope missing')
  const data = response.data
  if (
    !data ||
    typeof data !== 'object' ||
    !('accessToken' in data) ||
    typeof data.accessToken !== 'string'
  )
    throw new Error('Rotated memory access missing')
  const claims: unknown = JSON.parse(
    Buffer.from(data.accessToken.split('.')[1], 'base64url').toString('utf8'),
  )
  if (!claims || typeof claims !== 'object' || !('exp' in claims) || typeof claims.exp !== 'number')
    throw new Error('Access expiry missing')
  const expiration = claims.exp
  await expect(page.getByRole('button', { name: '刷新数据', exact: true })).toBeVisible()
  // Spring's default timestamp validator permits clock skew; wait past expiry plus that margin.
  const wait = expiration * 1000 + 65_000 - Date.now()
  if (wait < 0 || wait > 135_000) throw new Error('Unexpected test access expiry window')
  await new Promise((resolve) => setTimeout(resolve, wait))
  const unauthorized = page.waitForResponse(
    (value) => endpoint(value, '/system/users/page') && value.status() === 401,
  )
  const refreshed = page.waitForResponse(
    (value) => endpoint(value, '/auth/browser/refresh') && value.status() === 200,
  )
  const replayed = page.waitForResponse(
    (value) => endpoint(value, '/system/users/page') && value.status() === 200,
  )
  await page.getByRole('button', { name: '刷新数据', exact: true }).click()
  await unauthorized
  await refreshed
  await replayed
  await expect(page).toHaveURL(/\/system\/user$/)
  await expect(page.getByRole('cell', { name: credentials.username, exact: true })).toBeVisible()
  completed.push({
    name: 'Real 60-second access expiry plus clock skew; backend 401; cookie rotation; protected query replay',
    result: 'passed',
  })
})

test('unavailable Web Locks fails closed without automatic cookie mutation', async ({
  page,
  browser,
}) => {
  await login(page)
  const cookieState = await page.context().cookies()
  const limited = await browser.newContext({ baseURL: checkpoint.origin, ignoreHTTPSErrors: false })
  try {
    await limited.addCookies(cookieState)
    await limited.addInitScript(() =>
      Object.defineProperty(navigator, 'locks', { value: undefined }),
    )
    let refreshRequests = 0
    limited.on('request', (request) => {
      if (endpoint(request, '/auth/browser/refresh') || endpoint(request, '/auth/browser/logout'))
        refreshRequests++
    })
    const tab = await limited.newPage()
    await tab.goto('/dashboard')
    await expect(tab).toHaveURL(/\/login$/)
    expect(refreshRequests).toBe(0)
    expect(
      (await limited.cookies()).some((cookie) => cookie.name === '__Host-apocalypse-refresh'),
    ).toBe(true)
  } finally {
    await limited.close()
  }
  completed.push({
    name: 'Missing Web Locks forces relogin without refresh/logout or clearing shared cookie',
    result: 'passed',
  })
})
