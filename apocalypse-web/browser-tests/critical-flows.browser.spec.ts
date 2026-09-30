import { expect, test } from '@playwright/test'

test('real React/Axios/Dyna fixture rejects revoked and previous-account late effects', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.name))
  await page.goto('/test-fixtures/module-lifecycle.html')
  await expect(page).toHaveTitle('PASS — Optional module lifecycle')
  await expect(page.locator('#status')).toContainText('ALL 11 CHECKS PASSED')
  expect(failures).toEqual([])
})

test('settings light/dark/system drives actual Sonner theme after next-themes removal', async ({
  page,
}) => {
  await page.goto('/test-fixtures/frontend-controls.html')
  await page.getByRole('button', { name: 'Show toast', exact: true }).click()
  for (const theme of ['light', 'dark'] as const) {
    await page.getByRole('button', { name: `Theme ${theme}`, exact: true }).click()
    await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', theme)
    expect(
      await page.locator('html').evaluate((element) => element.classList.contains('dark')),
    ).toBe(theme === 'dark')
  }
  await page.getByRole('button', { name: 'Theme system', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'light')
})

test('form validation, keyboard escape and focus return run in a real portal', async ({ page }) => {
  await page.goto('/test-fixtures/frontend-controls.html')
  const trigger = page.getByRole('button', { name: 'Open form', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Fixture form' })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.getByText('请输入Name', { exact: true })).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Fixture')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Saved')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByTestId('saved')).toHaveAttribute('data-count', '1')
})

test('department form uses operation-specific string IDs and preserves missing role scope', async ({
  page,
}) => {
  await page.goto('/test-fixtures/frontend-controls.html')
  await page.getByRole('button', { name: 'Create user', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '新增用户' })
  await expect(dialog.getByText('正在加载可选择的部门…')).toBeHidden()
  await dialog.getByRole('textbox', { name: '用户名' }).fill('fixture-create')
  await dialog.getByLabel('密码', { exact: false }).fill('FixturePass1!')
  await dialog.getByRole('combobox', { name: '部门', exact: true }).click()
  await page.getByRole('option', { name: 'Fixture department', exact: true }).click()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByTestId('saved')).toHaveAttribute('data-department', '9223372036854775806')
  await expect(page.getByTestId('saved')).toHaveAttribute('data-operation', 'CREATE')

  await page.getByRole('button', { name: 'Edit user', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '编辑用户' })
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByTestId('saved')).toHaveAttribute('data-department', '')
  await expect(page.getByTestId('saved')).toHaveAttribute('data-operation', 'UPDATE')

  await page.getByRole('button', { name: 'Edit legacy role', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '编辑角色' })
  await expect(dialog.getByText('保留当前数据范围', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByTestId('saved')).toHaveAttribute('data-scope', '')
})

test('denied department options stop submission and empty choices do not claim unrestricted access', async ({
  page,
}) => {
  await page.goto('/test-fixtures/frontend-controls.html')
  await page.getByRole('button', { name: 'Denied user', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增用户' })
  await expect(dialog.getByRole('alert')).toContainText('本次操作没有部门选择权限')
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Empty user', exact: true }).click()
  await expect(dialog.getByText(/当前操作没有可选择的有效部门/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
})

test('a late rejected login cannot toast or navigate after an account switch', async ({ page }) => {
  await page.goto('/test-fixtures/login-lifecycle.html')
  await page.getByLabel('用户名', { exact: true }).fill('fixture-user')
  await page.getByLabel('密码', { exact: true }).fill('fixture-only-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录中…', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Switch account', exact: true }).click()
  await page.getByRole('button', { name: 'Reject login', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled()
  await expect(page.getByTestId('identity')).toHaveAttribute('data-route', '/login')
  await expect(page.getByTestId('identity')).toHaveAttribute('data-user', '2')
  await expect(page.getByText('Obsolete login failure', { exact: true })).toHaveCount(0)
})

test('an accepted login cannot navigate after the success animation crosses an identity change', async ({
  page,
}) => {
  await page.goto('/test-fixtures/login-lifecycle.html')
  await page.getByLabel('用户名', { exact: true }).fill('fixture-user')
  await page.getByLabel('密码', { exact: true }).fill('fixture-only-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录中…', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Finish login', exact: true }).click()
  await expect(page.getByTestId('identity')).toHaveAttribute('data-user', '1')
  await page.getByRole('button', { name: 'Switch account', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled()
  await expect(page.getByTestId('identity')).toHaveAttribute('data-route', '/login')
  await expect(page.getByTestId('identity')).toHaveAttribute('data-user', '2')
})

test('the current accepted login still performs the intended navigation', async ({ page }) => {
  await page.goto('/test-fixtures/login-lifecycle.html')
  await page.getByLabel('用户名', { exact: true }).fill('fixture-user')
  await page.getByLabel('密码', { exact: true }).fill('fixture-only-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录中…', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Finish login', exact: true }).click()
  await expect(page.getByText('Accepted navigation', { exact: true })).toBeVisible()
  await expect(page.getByTestId('identity')).toHaveAttribute('data-route', '/protected')
})
