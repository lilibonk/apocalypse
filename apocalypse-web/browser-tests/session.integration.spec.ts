import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { chromium, expect, test, type Locator, type Page, type Response } from '@playwright/test'

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
  await expect(page).toHaveURL(new RegExp(`${path}(?:\\?.*)?$`))
  // This authentication rehearsal uses the supported field-list workflow. Object workspaces
  // have their own selection/edit/paging regressions and are now the initial desktop view.
  if (path === '/system/user' || path === '/system/online')
    await page
      .getByRole('group', { name: '页面视图' })
      .getByRole('button', { name: '列表', exact: true })
      .click()
  if (path === '/system/dept')
    await page
      .getByRole('group', { name: '部门展示方式' })
      .getByRole('button', { name: '树表', exact: true })
      .click()
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

async function responseData(response: Response): Promise<unknown> {
  const body: unknown = await response.json()
  if (
    !body ||
    typeof body !== 'object' ||
    !('code' in body) ||
    body.code !== 0 ||
    !('data' in body)
  )
    throw new Error(`Expected a successful envelope from ${new URL(response.url()).pathname}`)
  return body.data
}

function stringIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== 'string') ||
    new Set(value).size !== value.length
  )
    throw new Error('Expected a complete collection of unique string IDs')
  return value as string[]
}

async function roleList(page: Page): Promise<void> {
  await navigate(page, '/system/role')
  await page.getByRole('button', { name: '角色列表', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '角色名称 / 标识', exact: true })).toBeVisible()
}

async function revalidateAuthorization(page: Page): Promise<void> {
  const current = page.waitForResponse(
    (response) => endpoint(response, '/system/users/me') && response.status() === 200,
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await responseData(await current)
  await expect(page.getByRole('button', { name: /^账户菜单：/ })).toBeVisible()
}

/** Only normal editor controls can close this dialog; snapshot replacement may close it first. */
async function closeBusinessDialog(dialog: Locator): Promise<void> {
  const back = dialog.getByRole('button', { name: '返回角色', exact: true })
  await expect.poll(async () => !(await dialog.isVisible()) || (await back.isVisible())).toBe(true)
  if (await dialog.isVisible()) {
    try {
      await back.click({ timeout: 2000 })
    } catch {
      // A successful /me change can unmount the old editor between visibility and click.
      await expect(dialog).toBeHidden()
    }
  }
  await expect(dialog).toBeHidden()
}

/** Business authority is granted separately from navigation, through the full baseline editor. */
async function setUserListGrant(page: Page, roleRow: Locator, selected: boolean): Promise<string> {
  const initial = page.waitForResponse(
    (response) =>
      /^\/api\/system\/roles\/[^/]+\/permissions$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  )
  await roleRow.getByRole('button', { name: '业务权限', exact: true }).click()
  const baseline = await responseData(await initial)
  if (
    !baseline ||
    typeof baseline !== 'object' ||
    !('roleId' in baseline) ||
    typeof baseline.roleId !== 'string'
  )
    throw new Error('Role permission baseline identity missing')
  const roleId = baseline.roleId
  const dialog = page.getByRole('dialog', { name: '业务权限', exact: true })
  await dialog.getByRole('button', { name: '编辑业务授权', exact: true }).click()
  if (selected) await dialog.getByRole('button', { name: '候选权限', exact: true }).click()
  await dialog
    .getByRole('textbox', { name: '搜索权限名称或标识', exact: true })
    .fill('system:user:list')
  await dialog.getByRole('button', { name: '查询', exact: true }).click()
  const entry = dialog
    .getByRole('listitem')
    .filter({ has: page.getByText('system:user:list', { exact: true }) })
  await expect(entry).toHaveCount(1)
  await entry.getByRole('button', { name: selected ? /^添加授权：/ : /^移除授权：/ }).click()
  await dialog.getByRole('button', { name: '审阅变更', exact: true }).click()
  const saved = page.waitForResponse(
    (response) =>
      endpoint(response, `/system/roles/${roleId}/permissions`) &&
      response.request().method() === 'PUT',
  )
  await dialog.getByRole('button', { name: '保存授权', exact: true }).click()
  const response = await saved
  await responseData(response)
  const submitted: unknown = response.request().postDataJSON()
  if (
    !submitted ||
    typeof submitted !== 'object' ||
    !('upsert' in submitted) ||
    !('remove' in submitted)
  )
    throw new Error('Permission delta missing')
  expect(Array.isArray(submitted.upsert) ? submitted.upsert.length : -1).toBe(selected ? 1 : 0)
  expect(stringIds(submitted.remove)).toHaveLength(selected ? 0 : 1)
  await revalidateAuthorization(page)
  await closeBusinessDialog(dialog)
  return roleId
}

async function readRoleNavigation(page: Page, roleRow: Locator, roleId: string): Promise<string[]> {
  const initial = page.waitForResponse(
    (response) =>
      endpoint(response, `/system/roles/${roleId}/navigation`) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  )
  await roleRow.getByRole('button', { name: '导航分配', exact: true }).click()
  const value = await responseData(await initial)
  if (!value || typeof value !== 'object' || !('navigationIds' in value))
    throw new Error('Navigation baseline missing')
  const ids = stringIds(value.navigationIds)
  const dialog = page.getByRole('dialog', { name: '导航分配', exact: true })
  await dialog.getByRole('button', { name: '返回图谱', exact: true }).click()
  await expect(dialog).toBeHidden()
  return ids
}

async function grantUserNavigation(page: Page, roleRow: Locator, roleId: string): Promise<void> {
  await roleRow.getByRole('button', { name: '导航分配', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导航分配', exact: true })
  await dialog
    .getByRole('searchbox', { name: '搜索导航名称、路径或 ID…', exact: true })
    .fill('用户管理')
  const entry = dialog
    .getByRole('listitem')
    .filter({ has: page.getByText('用户管理', { exact: true }) })
  await expect(entry).toHaveCount(1)
  await entry.getByRole('button', { name: '添加授权', exact: true }).click()
  await dialog.getByRole('button', { name: '审阅关联变更', exact: true }).click()
  const saved = page.waitForResponse(
    (response) =>
      endpoint(response, `/system/roles/${roleId}/navigation`) &&
      response.request().method() === 'PUT',
  )
  await dialog.getByRole('button', { name: '确认并保存关联', exact: true }).click()
  await responseData(await saved)
  await expect(dialog).toBeHidden()
  await revalidateAuthorization(page)
}

async function assignRoleMember(
  page: Page,
  roleRow: Locator,
  roleId: string,
  username: string,
): Promise<void> {
  const initial = page.waitForResponse(
    (response) =>
      endpoint(response, `/system/roles/${roleId}/user-ids`) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  )
  await roleRow.getByRole('button', { name: '角色成员', exact: true }).click()
  const baseline = stringIds(await responseData(await initial))
  const dialog = page.getByRole('dialog', { name: '角色成员', exact: true })
  await dialog.getByRole('button', { name: '添加成员', exact: true }).click()
  await dialog.getByRole('textbox', { name: '搜索用户名或显示名称', exact: true }).fill(username)
  const candidateResponse = page.waitForResponse(
    (response) =>
      endpoint(response, '/system/users/page') &&
      new URL(response.url()).searchParams.get('keyword') === username &&
      response.status() === 200,
  )
  await dialog.getByRole('button', { name: '查找成员', exact: true }).click()
  const candidates = await responseData(await candidateResponse)
  if (
    !candidates ||
    typeof candidates !== 'object' ||
    !('list' in candidates) ||
    !Array.isArray(candidates.list)
  )
    throw new Error('Member candidate page missing')
  const candidate: unknown = candidates.list.find(
    (entry: unknown) =>
      entry && typeof entry === 'object' && 'username' in entry && entry.username === username,
  )
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !('id' in candidate) ||
    typeof candidate.id !== 'string'
  )
    throw new Error('Member candidate identity missing')
  const entry = dialog
    .getByRole('listitem')
    .filter({ has: page.getByText(username, { exact: true }) })
  await entry.getByRole('button', { name: '添加授权', exact: true }).click()
  await dialog.getByRole('button', { name: '审核变更', exact: true }).click()
  const saved = page.waitForResponse(
    (response) =>
      endpoint(response, `/system/roles/${roleId}/users`) && response.request().method() === 'PUT',
  )
  await dialog.getByRole('button', { name: '保存成员关系', exact: true }).click()
  const response = await saved
  await responseData(response)
  expect(stringIds(response.request().postDataJSON()).sort()).toEqual(
    [...new Set([...baseline, candidate.id])].sort(),
  )
  await expect(dialog).toBeHidden()
  await revalidateAuthorization(page)
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
  const focusReads = [page, second].map((tab) =>
    tab.waitForResponse(
      (response) => endpoint(response, '/system/users/me') && response.status() === 200,
    ),
  )
  await Promise.all([
    page.evaluate(() => window.dispatchEvent(new Event('focus'))),
    second.evaluate(() => window.dispatchEvent(new Event('focus'))),
  ])
  for (const response of await Promise.all(focusReads)) await responseData(response)
  expect(finished).toBe(0)
  // Both documents now bootstrap from the shared cookie, exercising two real rotations.
  await Promise.all([page.reload(), second.reload()])
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

  await roleList(page)
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

  await roleList(page)
  roleRow = await search(page, '角色名称 / 标识', roleName)
  const roleId = await setUserListGrant(page, roleRow, true)
  roleRow = await search(page, '角色名称 / 标识', roleName)
  await grantUserNavigation(page, roleRow, roleId)
  roleRow = await search(page, '角色名称 / 标识', roleName)
  const savedNavigation = await readRoleNavigation(page, roleRow, roleId)
  expect(savedNavigation.length).toBeGreaterThan(0)
  await assignRoleMember(page, roleRow, roleId, username)

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
    await roleList(admin)
    roleRow = await search(admin, '角色名称 / 标识', roleName)
    await setUserListGrant(admin, roleRow, false)
    roleRow = await search(admin, '角色名称 / 标识', roleName)
    expect((await readRoleNavigation(admin, roleRow, roleId)).sort()).toEqual(
      [...savedNavigation].sort(),
    )
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
    const forbiddenUsers = page.waitForResponse(async (response) => {
      if (!endpoint(response, '/system/users/page')) return false
      if (response.status() === 403) return true
      if (response.status() !== 200) return false
      const body: unknown = await response.json()
      return Boolean(body && typeof body === 'object' && 'code' in body && body.code === 40300)
    })
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    )
    const currentUser = await responseData(await renewedPermissions)
    if (
      !currentUser ||
      typeof currentUser !== 'object' ||
      !('perms' in currentUser) ||
      !Array.isArray(currentUser.perms)
    )
      throw new Error('Accepted permission snapshot missing')
    expect(currentUser.perms).not.toContain('system:user:list')
    await forbiddenUsers
    page.off('response', observePermission)
    await expect(page).toHaveURL(/\/system\/user(?:\?.*)?$/)
    await expect(page.getByRole('link', { name: '用户管理', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
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
    await roleList(admin)
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
    name: 'Actual role/department CRUD and independent business/navigation/member grants; missed-broadcast restore; account cache reset; API-only withdrawal preserves navigation and returns 403; persistent forced logout',
    result: 'passed',
  })
})

test('an actually expired access token refreshes from cookie and a new query generation recovers', async ({
  page,
}) => {
  test.setTimeout(200_000)
  expect(checkpoint.accessTtlSeconds).toBe(60)
  expect(checkpoint.effectiveExpiresIn).toBe(60)
  const access = await login(page)
  await navigate(page, '/system/user')
  await search(page, '用户名 / 昵称', credentials.username)
  const claims: unknown = JSON.parse(
    Buffer.from(access.split('.')[1], 'base64url').toString('utf8'),
  )
  if (!claims || typeof claims !== 'object' || !('exp' in claims) || typeof claims.exp !== 'number')
    throw new Error('Access expiry missing')
  if (!('iat' in claims) || typeof claims.iat !== 'number')
    throw new Error('Access issuance time missing')
  expect(claims.exp - claims.iat).toBe(60)
  const expiration = claims.exp
  // Spring's default timestamp validator permits clock skew; wait past expiry plus that margin.
  const wait = expiration * 1000 + 65_000 - Date.now()
  if (wait < 0 || wait > 135_000) throw new Error('Unexpected test access expiry window')
  await new Promise((resolve) => setTimeout(resolve, wait))
  let oldQueryRequests = 0
  const transitions: string[] = []
  const observeRequest = (request: { url(): string }) => {
    if (
      endpoint(request, '/system/users/page') &&
      new URL(request.url()).searchParams.get('keyword') === credentials.username
    )
      oldQueryRequests++
  }
  const observeResponse = (response: Response) => {
    if (endpoint(response, '/system/users/page') && response.status() === 401)
      transitions.push('old-query-401')
    if (endpoint(response, '/auth/browser/refresh') && response.status() === 200)
      transitions.push('refresh')
    if (endpoint(response, '/system/users/me') && response.status() === 200) transitions.push('me')
    if (
      endpoint(response, '/system/users/page') &&
      response.status() === 200 &&
      !new URL(response.url()).searchParams.get('keyword')
    )
      transitions.push('new-query')
  }
  page.on('request', observeRequest)
  page.on('response', observeResponse)
  const unauthorized = page.waitForResponse(
    (value) => endpoint(value, '/system/users/page') && value.status() === 401,
  )
  const refreshed = page.waitForResponse(
    (value) => endpoint(value, '/auth/browser/refresh') && value.status() === 200,
  )
  const accepted = page.waitForResponse(
    (value) => endpoint(value, '/system/users/me') && value.status() === 200,
  )
  const newQuery = page.waitForResponse(
    (value) =>
      endpoint(value, '/system/users/page') &&
      value.status() === 200 &&
      !new URL(value.url()).searchParams.get('keyword'),
  )
  await page.getByRole('button', { name: '刷新数据', exact: true }).click()
  const expiredResponse = await unauthorized
  expect(new URL(expiredResponse.url()).searchParams.get('keyword')).toBe(credentials.username)
  const renewed = await responseData(await refreshed)
  if (
    !renewed ||
    typeof renewed !== 'object' ||
    !('accessToken' in renewed) ||
    typeof renewed.accessToken !== 'string' ||
    'refreshToken' in renewed
  )
    throw new Error('Cookie rotation must return a new memory access token only')
  expect(renewed.accessToken === access).toBe(false)
  await responseData(await accepted)
  await responseData(await newQuery)
  await expect(page).toHaveURL(/\/system\/user(?:\?.*)?$/)
  await expect(page.getByRole('textbox', { name: '用户名 / 昵称', exact: true })).toHaveValue('')
  await expect(page.getByRole('cell', { name: credentials.username, exact: true })).toBeVisible()
  // The old filtered request is cancelled after refresh, never replayed under a new generation.
  expect(oldQueryRequests).toBe(1)
  expect(transitions).toEqual(['old-query-401', 'refresh', 'me', 'new-query'])
  page.off('request', observeRequest)
  page.off('response', observeResponse)
  completed.push({
    name: 'Real 60-second access expiry plus clock skew; backend 401; cookie rotation and accepted me; new query generation recovers without replaying the old operation',
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
