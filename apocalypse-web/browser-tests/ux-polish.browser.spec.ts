import { expect, test } from '@playwright/test'

for (const theme of ['fluid', 'sketchbook', 'obsidian'] as const) {
  test(`pagination jump and Mod+S draft review stay responsive in ${theme} theme with motion off`, async ({
    page,
  }) => {
    await page.goto(
      `/test-fixtures/video-surfaces.html?surface=config&manyConfigs&theme=${theme}&motionOff`,
    )
    await expect(page.locator('html')).toHaveAttribute('data-theme-world', theme)
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')

    const pager = page.getByRole('navigation', { name: '参数分页' })
    const trigger = pager.locator('[data-slot="pagination-jump-trigger"]')
    await expect(trigger).toHaveText('1 / 11')

    await trigger.click()
    const jumpInput = pager.locator('[data-slot="pagination-jump-input"]')
    await expect(jumpInput).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(jumpInput).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    await jumpInput.fill('999')
    await page.keyboard.press('Enter')
    await expect(pager).toContainText('第 201-206 条，共 206 条')
    await expect(trigger).toHaveText('11 / 11')
    await expect(trigger).toBeFocused()

    await pager.getByRole('button', { name: '上一页', exact: true }).click()
    await expect(trigger).toHaveText('10 / 11')
    await trigger.click()
    await jumpInput.fill('1')
    await page.keyboard.press('Enter')
    await expect(pager).toContainText('第 1-20 条，共 206 条')

    await page.getByLabel('主题', { exact: true }).fill('dim')
    await expect(page.locator('[data-slot="draft-bar"]')).toContainText('1 项未保存')

    await page.keyboard.press(theme === 'obsidian' ? 'Meta+s' : 'Control+s')
    const review = page.getByRole('dialog', { name: '待保存的修改' })
    await expect(review).toBeVisible()
    await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-count', '0')
    await review.getByRole('button', { name: '返回编辑', exact: true }).click()
  })
}

test('search pending signal, clear button, indeterminate shift-range selection, and copy feedback work in real Chromium', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(
    '/test-fixtures/video-surfaces.html?surface=user&selectable&theme=obsidian&motionOff',
  )
  await expect(page.getByRole('table')).toBeVisible()

  const searchInput = page.getByLabel('用户名 / 昵称', { exact: true })
  const searchSubmit = page.getByRole('button', { name: '查询', exact: true })
  await expect(searchSubmit).not.toHaveAttribute('data-pending-apply', 'true')

  await searchInput.fill('account-2')
  await expect(searchSubmit).toHaveAttribute('data-pending-apply', 'true')

  await page.locator('[data-slot="search-input-clear"]').click()
  await expect(searchInput).toHaveValue('')
  await expect(searchSubmit).not.toHaveAttribute('data-pending-apply', 'true')

  const headerCheckbox = page.getByRole('checkbox', { name: '全选当前页', exact: true })
  const row1Checkbox = page.getByRole('checkbox', { name: '选择行 u1', exact: true })
  const row2Checkbox = page.getByRole('checkbox', { name: '选择行 u2', exact: true })
  const row3Checkbox = page.getByRole('checkbox', { name: '选择行 u3', exact: true })

  await row1Checkbox.click()
  await expect
    .poll(() => headerCheckbox.evaluate((el) => (el as HTMLInputElement).indeterminate))
    .toBe(true)
  await expect(page.getByRole('button', { name: '批量删除 (1)', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '清空已选', exact: true })).toBeVisible()

  await row3Checkbox.click({ modifiers: ['Shift'] })
  await expect(row1Checkbox).toBeChecked()
  await expect(row2Checkbox).toBeChecked()
  await expect(row3Checkbox).toBeChecked()
  await expect(page.getByRole('button', { name: '批量删除 (3)', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '清空已选', exact: true }).click()
  await expect(row1Checkbox).not.toBeChecked()
  await expect(row2Checkbox).not.toBeChecked()
  await expect(row3Checkbox).not.toBeChecked()
  await expect
    .poll(() => headerCheckbox.evaluate((el) => (el as HTMLInputElement).indeterminate))
    .toBe(false)

  const account1Row = page.getByRole('row').filter({ hasText: 'account-1' }).first()
  await account1Row.hover()
  const copyButton = account1Row.locator('[data-slot="cell-copy-button"]')
  await expect(copyButton).toHaveAttribute('aria-label', '复制 account-1')
  await copyButton.click()
  await expect(copyButton).toHaveAttribute('data-copied', '')
  await expect(copyButton).toBeEnabled()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('account-1')
})

test('middle-clicking tabs respects pinned tabs and unsaved draft close guard', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=tabs')

  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(3)
  await expect(page.getByRole('tab', { name: '用户管理' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: '工作台' }).click({ button: 'middle' })
  await expect(tabs).toHaveCount(3)

  await page.getByRole('button', { name: 'Mark config dirty', exact: true }).click()
  await page.getByRole('tab', { name: '参数设置' }).click({ button: 'middle' })

  const dialog = page.getByRole('alertdialog', { name: '关闭页签将放弃未保存修改' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(tabs).toHaveCount(3)

  await page.getByRole('tab', { name: '参数设置' }).click({ button: 'middle' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '放弃并关闭', exact: true }).click()
  await expect(tabs).toHaveCount(2)
  await expect(page.getByRole('tab', { name: '参数设置' })).toHaveCount(0)

  await page.getByRole('tab', { name: '用户管理' }).click({ button: 'middle' })
  await expect(tabs).toHaveCount(1)
  await expect(page.getByRole('tab', { name: '工作台' })).toHaveAttribute('aria-selected', 'true')
})

test('file management stacks quota strip, full-width table, and pagination vertically without dropdown duplication', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/test-fixtures/video-surfaces.html?surface=file&empty=1')

  await expect(page.getByRole('heading', { name: '文件管理', exact: true })).toBeVisible()
  await expect(page.getByText('当前账户仅可管理本人上传或授权范围内的文件')).toHaveCount(0)
  await expect(page.locator('[data-slot="file-quota-strip"]')).toBeVisible()

  await page.getByRole('combobox', { name: '分类', exact: true }).click()
  await expect(page.getByRole('option', { name: '全部全部分类' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: '全部', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('combobox', { name: '类型', exact: true }).click()
  await expect(page.getByRole('option', { name: '全部全部类型' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: '全部', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  const emptyState = page.getByText('暂无符合条件的文件记录', { exact: true })
  const emptyCard = page
    .getByRole('status')
    .filter({ hasText: '暂无符合条件的文件记录' })
    .locator('..')
  const pager = page.getByText('第 0-0 条，共 0 条', { exact: true }).locator('..')
  await expect(emptyState).toBeVisible()
  await expect(pager).toBeVisible()
  await expect(page.getByText('选择表格行，查看存储键')).toHaveCount(0)

  const headerRootPadding = await page
    .locator('[data-slot="page-header"]')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el.parentElement!).paddingLeft))
  expect(headerRootPadding).toBeGreaterThanOrEqual(16)

  const tableBox = (await emptyCard.boundingBox())!
  const pagerBox = (await pager.boundingBox())!
  expect(pagerBox.y).toBeGreaterThanOrEqual(tableBox.y + tableBox.height - 2)
  expect(Math.abs(pagerBox.x - tableBox.x)).toBeLessThanOrEqual(4)
  expect(tableBox.width).toBeGreaterThan(1000)

  await page.goto('/test-fixtures/video-surfaces.html?surface=file')
  const row = page.getByRole('row').filter({ hasText: 'quarterly-report.pdf' })
  await expect(row).toBeVisible()
  await row.click()
  const sheet = page.getByRole('dialog', { name: '文件元数据检查器' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('document/20261119/abc12345.pdf')
})
