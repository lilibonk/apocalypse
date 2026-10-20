import { expect, test } from '@playwright/test'

test('account selection carries through list, edit readback and pagination', async ({ page }) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user')
  const views = page.getByRole('group', { name: '页面视图' })
  const selection = page.getByRole('button', { name: '选择账号：成员 2', exact: true })
  await selection.click()
  const inspector = page.getByRole('complementary', { name: '账号上下文' })
  await expect(inspector).toContainText('account-2')
  await views.getByRole('button', { name: '列表', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await views.getByRole('button', { name: '工作区', exact: true }).click()
  await expect(selection).toHaveAttribute('aria-pressed', 'true')
  await inspector.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑用户' })
  await editor.getByLabel('昵称', { exact: true }).fill('已更新的成员')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(editor.getByLabel('昵称', { exact: true })).toHaveValue('已更新的成员')
  await page.setViewportSize({ width: 1280, height: 800 })
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(inspector).toContainText('已更新的成员')
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-count', '1')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择账号：成员 11', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '选择账号：成员 1', exact: true })).toHaveCount(0)
  await views.getByRole('button', { name: '列表', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'account-11', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'account-1', exact: true })).toHaveCount(0)
})

test('a denied account scope removes object data and does not claim an empty success', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user')
  await page.getByRole('button', { name: '选择账号：成员 2', exact: true }).click()
  await page.getByRole('button', { name: 'Deny account scope' }).click()
  await page.getByRole('button', { name: '刷新数据', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('账号范围已撤回')
  await expect(page.getByRole('complementary', { name: '账号上下文' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '选择账号：成员 2', exact: true })).toHaveCount(0)
  await expect(page.getByText('暂无数据', { exact: true })).toHaveCount(0)
})

test('a command handoff searches the guarded source and keeps context across view changes', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user&context')
  const search = page.getByLabel('用户名 / 昵称', { exact: true })
  const views = page.getByRole('group', { name: '页面视图' })
  await expect(search).toHaveValue('account-12')
  await expect(
    page.getByRole('button', { name: '选择账号：成员 12', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '选择账号：成员 1', exact: true })).toHaveCount(0)
  await views.getByRole('button', { name: '列表', exact: true }).click()
  await expect(search).toHaveValue('account-12')
  await expect(page.getByRole('cell', { name: 'account-12', exact: true })).toBeVisible()
  await views.getByRole('button', { name: '工作区', exact: true }).click()
  await search.fill('no-such-account')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择账号：成员 12', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(page.getByRole('button', { name: '选择账号：成员 1', exact: true })).toBeVisible()
})

test('a narrow object workspace opens a focused inspector and returns to its selected account', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user&narrow')
  const trigger = page.getByRole('button', { name: '选择账号：成员 2', exact: true })
  await trigger.click()
  const sheet = page.getByRole('dialog', { name: '账号上下文' })
  await expect(sheet).toContainText('account-2')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
