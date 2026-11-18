import { expect, test } from '@playwright/test'

test('login heatmap and paged records share a unified workspace without inventing hour filters', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=loginlog')
  const grid = page.getByRole('grid')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(grid).toHaveCount(0)
  await page.getByRole('button', { name: '展开活动概览', exact: true }).click()
  await expect(grid).toBeVisible()
  await grid.locator('[data-cell="2-10"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(grid.locator('[data-cell="2-11"]')).toBeFocused()
  await expect(grid.locator('[data-cell="2-11"]')).toHaveAttribute('tabindex', '0')

  await grid.locator('[data-cell="2-11"]').click()
  const causalBanner = page.getByRole('status', { name: '当前热力与指标联动筛选' })
  await expect(causalBanner).toBeVisible()
  await expect(causalBanner).toContainText('联动筛选：')
  await causalBanner.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(causalBanner).toHaveCount(0)

  const details = page.getByRole('button', { name: '详情', exact: true }).first()
  await details.click()
  await expect(page.getByRole('dialog')).toContainText('设备')
  await page.keyboard.press('Escape')
  await expect(details).toBeFocused()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-body', /"page":2/)
  expect(JSON.parse((await page.getByTestId('fixture-saves').getAttribute('data-body'))!)).toEqual({
    page: 2,
    size: 10,
  })
  await page.getByRole('button', { name: '近 30 天', exact: true }).click()
  await expect(grid).toBeVisible()
  await expect(grid.locator('[data-cell="2-11"]')).toHaveAttribute('tabindex', '0')
  await expect(grid).not.toHaveAttribute('data-wave', 'true')

  await page.getByRole('button', { name: '收起活动概览', exact: true }).click()
  await expect(grid).toHaveCount(0)
})

test('account kick ends every matching fixture session while leaving other accounts intact', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=online&motionOff')
  const alice = page.locator('[data-account="alice"]')
  await alice.locator('button[aria-expanded]').click()
  await expect(alice.getByRole('listitem')).toHaveCount(2)
  await alice.getByRole('button', { name: /强退全部设备/ }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('全部设备')
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  await expect(alice.getByRole('listitem')).toHaveCount(2)
  await alice.getByRole('button', { name: /强退全部设备/ }).click()
  await confirm.getByRole('button', { name: '确认强退', exact: true }).click()
  await expect(alice).toHaveCount(0)
  await expect(page.locator('[data-account="bob"]')).toBeVisible()
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute(
    'data-body',
    '{"username":"alice"}',
  )
  await expect(page.getByText('账号 alice 已不在当前会话列表中。', { exact: true })).toBeVisible()
})

test('refresh does not retarget an expired account and a failed self kick keeps its confirmation', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=online&motionOff')
  await page.locator('[data-account="alice"] button[aria-expanded]').click()
  await page.getByRole('button', { name: 'Expire alice sessions', exact: true }).click()
  await page.getByRole('button', { name: '刷新数据', exact: true }).click()
  await expect(page.locator('[data-account="alice"]')).toHaveCount(0)
  await expect(page.locator('[data-account="bob"] button[aria-expanded]')).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await page.goto('/test-fixtures/video-surfaces.html?surface=online&self&kickFail')
  await page
    .locator('[data-account="alice"]')
    .getByRole('button', { name: /强退全部设备/ })
    .click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('这是你当前使用的账号')
  await confirm.getByRole('button', { name: '确认强退', exact: true }).click()
  await expect(page.getByText('当前账号暂时不能强退', { exact: true })).toBeVisible()
  await expect(confirm).toBeVisible()
  await expect(page.locator('[data-account="alice"]')).toBeVisible()
})

test('command answers carry user and permission context to an authorized destination', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=palette')
  const input = page.getByPlaceholder('搜索页面、动作，或输入 ? 提问…')
  await input.fill('?哪些用户还没有角色？')
  await page.getByRole('button', { name: /成员一/ }).click()
  await expect(page.getByTestId('fixture-navigation')).toHaveAttribute('data-path', '/system/user')
  expect(
    JSON.parse((await page.getByTestId('fixture-navigation').getAttribute('data-state'))!),
  ).toMatchObject({ entityIntent: { kind: 'user', id: 'u1' } })
  await page.getByRole('button', { name: 'Open palette', exact: true }).click()
  await input.fill('?谁能执行这项权限？')
  await page.getByRole('option', { name: /读取用户/ }).click()
  await page.getByRole('button', { name: '查看这项权限定义', exact: true }).click()
  await expect(page.getByTestId('fixture-navigation')).toHaveAttribute(
    'data-path',
    '/system/permission',
  )
  expect(
    JSON.parse((await page.getByTestId('fixture-navigation').getAttribute('data-state'))!),
  ).toMatchObject({ entityIntent: { kind: 'permission', id: 'p1' } })
})

test('operation detail names Java invocation accurately and copies the original value', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/test-fixtures/video-surfaces.html?surface=oper')
  await page.getByRole('button', { name: '详情', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('调用方法', { exact: true })).toBeVisible()
  await expect(sheet.getByText('请求方法', { exact: true })).toHaveCount(0)
  await sheet
    .getByText('调用方法', { exact: true })
    .locator('xpath=../..')
    .getByRole('button', { name: '复制', exact: true })
    .click()
  await expect(sheet.getByRole('button', { name: '已复制', exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'io.apocalypse.Fixture.update()',
  )
})
