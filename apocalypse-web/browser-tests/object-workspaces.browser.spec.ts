import { expect, test } from '@playwright/test'

test('account selection carries through table, edit readback, role assignment and pagination', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user')
  await expect(page.getByRole('table')).toBeVisible()

  const account2Row = page.getByRole('row').filter({ hasText: 'account-2' })
  await account2Row.getByRole('button', { name: '查看', exact: true }).click()

  const inspector = page.getByRole('dialog', { name: '账号上下文' })
  await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('account-2')

  await inspector.getByRole('button', { name: '编辑资料', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑用户' })
  await editor.getByLabel('昵称', { exact: true }).fill('已更新的成员')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(editor.getByLabel('昵称', { exact: true })).toHaveValue('已更新的成员')
  await page.setViewportSize({ width: 1280, height: 800 })
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(account2Row).toContainText('已更新的成员')
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-count', '1')

  await account2Row.getByRole('button', { name: '分配角色', exact: true }).click()
  const roleDialog = page.getByRole('dialog', { name: /为「.*」分配角色/ })
  await expect(roleDialog).toBeVisible()
  await roleDialog.getByRole('checkbox', { name: /审计员/ }).click()
  await roleDialog.getByRole('button', { name: '保存角色', exact: true }).click()
  await expect(roleDialog).toHaveCount(0)
  await expect(account2Row).toContainText('审计员')
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-count', '2')

  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByRole('cell', { name: /^account-11(?:\s|$)/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: /^account-1(?:\s|$)/ })).toHaveCount(0)
})

test('a denied account scope removes object data and does not claim an empty success', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user')
  await page
    .getByRole('row')
    .filter({ hasText: 'account-2' })
    .getByRole('button', { name: '查看', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: '账号上下文' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Deny account scope' }).click()
  await page.getByRole('button', { name: '刷新数据', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('账号范围已撤回')
  await expect(page.getByRole('dialog', { name: '账号上下文' })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: /^account-2(?:\s|$)/ })).toHaveCount(0)
  await expect(page.getByText('暂无数据', { exact: true })).toHaveCount(0)
})

test('a command handoff searches the guarded source and preserves unified filters', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user&context')
  const inspector = page.getByRole('dialog', { name: '账号上下文' })
  await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('account-12')
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)

  const search = page.getByLabel('用户名 / 昵称', { exact: true })
  await expect(search).toHaveValue('account-12')
  await expect(page.getByRole('cell', { name: /^account-12(?:\s|$)/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: /^account-1(?:\s|$)/ })).toHaveCount(0)

  await search.fill('no-such-account')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByRole('cell', { name: /^account-12(?:\s|$)/ })).toHaveCount(0)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(page.getByRole('cell', { name: /^account-1(?:\s|$)/ })).toBeVisible()
})

test('a narrow object workspace opens the slide-over account sheet within narrow bounds', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=user&narrow')
  await page
    .getByRole('row')
    .filter({ hasText: 'account-2' })
    .getByRole('button', { name: '查看', exact: true })
    .click()
  const details = page.getByRole('dialog', { name: '账号上下文' })
  await expect(details).toContainText('account-2')
  const box = await details.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(520)
})
