import { expect, test, type Page } from '@playwright/test'

/** 2026-10-18 reference-video adaptation: state, focus and motion-switch behaviour per surface. */

async function fillLogin(page: Page) {
  await page.getByLabel('用户名', { exact: true }).fill('fixture-user')
  await page.getByLabel('密码', { exact: true }).fill('fixture-only-password')
}

test('login submit collapses while waiting, keeps focus and refuses duplicate submits', async ({
  page,
}) => {
  await page.goto('/test-fixtures/login-lifecycle.html')
  await fillLogin(page)
  const submit = page.locator('[data-slot="login-submit"]')
  await submit.click()
  await expect(submit).toHaveAttribute('data-phase', 'waiting')
  await expect(submit).toHaveAttribute('data-collapsed')
  await expect(submit).toHaveAttribute('aria-busy', 'true')
  await expect(submit).toBeFocused()
  await page.keyboard.press('Enter')
  await submit.click({ force: true })
  await expect(page.getByTestId('identity')).toHaveAttribute('data-login-requests', '1')

  await page.getByRole('button', { name: 'Reject login', exact: true }).click()
  await expect(submit).toHaveAttribute('data-phase', 'idle')
  await expect(submit).not.toHaveAttribute('data-collapsed')
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await expect(page.getByLabel('密码', { exact: true })).toBeFocused()
})

test('login success check appears only for an accepted login before navigation', async ({
  page,
}) => {
  await page.goto('/test-fixtures/login-lifecycle.html')
  await fillLogin(page)
  const submit = page.locator('[data-slot="login-submit"]')
  await submit.click()
  await expect(submit.locator('.login-submit-check')).toHaveCount(0)
  await page.getByRole('button', { name: 'Finish login', exact: true }).click()
  await expect(page.getByText('Accepted navigation', { exact: true })).toBeVisible()
})

test('with motion off the submit button never changes geometry', async ({ page }) => {
  await page.goto('/test-fixtures/login-lifecycle.html')
  await page.getByRole('button', { name: 'Motion off', exact: true }).click()
  await fillLogin(page)
  const submit = page.locator('[data-slot="login-submit"]')
  const before = await submit.boundingBox()
  await submit.click()
  await expect(submit).toHaveAttribute('data-phase', 'waiting')
  await expect(submit).not.toHaveAttribute('data-collapsed')
  expect((await submit.boundingBox())?.width).toBe(before?.width)
  await expect(page.getByRole('button', { name: '登录中…' })).toBeVisible()
})

test('role page without a requested role opens the overview, drills into a chain and returns', async ({
  page,
}) => {
  await page.goto('/test-fixtures/role-resize.html?overview')
  const roles = page.getByRole('button', { name: /^角色 1，/ })
  await expect(roles).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑业务授权', exact: true })).toHaveCount(0)
  await roles.focus()
  await page.keyboard.press('Enter')
  await expect(roles).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Resize role 启用', exact: true }).click()
  await expect(page.getByRole('group', { name: '「Resize role」的授权链' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^成员\s*0$/ })).toBeVisible()
  await page.getByRole('button', { name: '权限全景', exact: true }).click()
  await expect(page.getByRole('button', { name: /^角色 1，/ })).toBeVisible()
})

test('config workspace keeps a multi-item draft, refuses a stale batch and rebases on request', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=config')
  const theme = page.getByLabel('主题', { exact: true })
  await theme.fill('dim')
  await expect(page.getByText('1 项未保存')).toBeVisible()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(theme).toHaveValue('light')
  await expect(page.getByText('1 项未保存')).toHaveCount(0)

  await theme.fill('dim')
  await page.getByLabel('密度', { exact: true }).fill('compact')
  await expect(page.getByText('2 项未保存')).toBeVisible()
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  const review = page.getByRole('dialog', { name: '待保存的修改' })
  await expect(review.getByText('compact')).toBeVisible()
  await review.getByRole('button', { name: '返回编辑', exact: true }).click()

  await page.getByRole('button', { name: 'Change theme elsewhere', exact: true }).click()
  await page.getByRole('button', { name: '保存改动', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('参数已被他人修改')
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-count', '1')
  await expect(theme).toHaveValue('dim')
  await expect(page.getByText('2 项未保存')).toBeVisible()

  await page.getByRole('button', { name: '载入最新值并保留我的修改', exact: true }).click()
  // Rebased: the original now shows the server's latest value, and the user's edit is kept.
  await expect(page.locator('.draft-original').first()).toHaveText('dark')
  await expect(theme).toHaveValue('dim')
  await page.getByRole('button', { name: '保存改动', exact: true }).click()
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-count', '2')
  await expect(page.getByText(/项未保存/)).toHaveCount(0)
  const body = JSON.parse(
    (await page.getByTestId('fixture-saves').getAttribute('data-body')) ?? '[]',
  ) as { id: string; expectedVersion: number }[]
  expect(body.find((item) => item.id === 'c1')?.expectedVersion).toBe(2)
})

test('operation log detail grows from its row and returns focus on close', async ({ page }) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=oper')
  const trigger = page.getByRole('button', { name: '详情', exact: true }).first()
  await trigger.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(page.locator('.origin-ghost')).toHaveCount(1)
  await expect(sheet.getByText('io.apocalypse.Fixture.update()')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('with motion off the operation log detail opens without an origin ghost', async ({ page }) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=oper&motionOff')
  await page.getByRole('button', { name: '详情', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.origin-ghost')).toHaveCount(0)
})

test('department chart is a keyboard tree: arrows move, Enter selects, minus collapses', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=dept')
  const item = (name: string) => page.getByRole('treeitem', { name: new RegExp(`^${name}`) })
  await item('总部').focus()
  await page.keyboard.press('ArrowDown')
  await expect(item('研发中心')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(item('运营中心')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item('客服组')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(item('运营中心')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(item('运营中心')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#dept-panel-title')).toHaveText('运营中心')
  await page.keyboard.press('-')
  await expect(item('运营中心')).toHaveAttribute('aria-expanded', 'false')
  await expect(item('客服组')).toHaveCount(0)
})

test('palette question mode answers a rule-based authorization question', async ({ page }) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=palette')
  const input = page.getByPlaceholder('搜索页面、动作，或输入 ? 提问…')
  await expect(input).toBeFocused()
  await input.fill('?')
  await expect(page.getByText('可以这样问')).toBeVisible()
  await page.getByRole('option', { name: '哪些角色处于闲置？' }).click()
  await expect(page.getByText('闲置角色样例')).toBeVisible()
  await expect(page.getByText('规则查询 · 非 AI')).toBeVisible()
  await expect(input).toBeFocused()
})

test('config workspace and draft bar fit a 320px phone without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/test-fixtures/video-surfaces.html?surface=config')
  await page.getByLabel('主题', { exact: true }).fill('dim')
  const bar = page.getByRole('region', { name: '未保存修改' })
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('button', { name: '保存改动', exact: true })).toBeInViewport()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
