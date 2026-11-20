import { expect, test } from '@playwright/test'

test('the card book creates, edits and removes both dictionary layers without visiting the list', async ({
  page,
}) => {
  await page.goto('/test-fixtures/dict-book.html')
  await page.getByRole('button', { name: '新增字典类型', exact: true }).click()
  const form = page.getByRole('dialog', { name: '新增字典类型', exact: true })
  await form.getByLabel(/^类型码/).fill('fixture_new')
  await form.getByLabel(/^字典名称/).fill('可处理的字典类型')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(form.getByLabel(/^字典名称/)).toHaveValue('可处理的字典类型')
  await page.setViewportSize({ width: 1280, height: 800 })
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: '查看此类型', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '可处理的字典类型', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('fixture_new')
  await sheet.getByRole('button', { name: '新增值', exact: true }).click()
  await sheet.getByLabel('显示标签', { exact: true }).fill('处理中')
  await sheet.getByLabel('编码值', { exact: true }).fill('PENDING')
  await sheet.getByRole('button', { name: '保存', exact: true }).click()
  await expect(sheet.locator('.dict-value-row')).toContainText('PENDING')
  await sheet.getByRole('button', { name: '编辑类型：可处理的字典类型', exact: true }).click()
  await sheet.getByLabel('字典类型编码', { exact: true }).fill('fixture_renamed')
  await sheet.getByLabel('字典名称', { exact: true }).fill('已修改的字典类型')
  await sheet.getByRole('button', { name: '保存类型', exact: true }).click()
  const renamedSheet = page.getByRole('dialog', { name: '已修改的字典类型', exact: true })
  await expect(renamedSheet).toContainText('fixture_renamed')
  await expect(renamedSheet.locator('.dict-value-row')).toContainText('处理中')
  await renamedSheet.getByRole('button', { name: '编辑：处理中', exact: true }).click()
  await renamedSheet.getByLabel('显示标签', { exact: true }).fill('已处理')
  await renamedSheet.getByRole('button', { name: '保存', exact: true }).click()
  await expect(renamedSheet.locator('.dict-value-row')).toContainText('已处理')
  await renamedSheet
    .getByRole('button', { name: '删除类型：已修改的字典类型', exact: true })
    .click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.dict-card')).toHaveCount(0)
  await expect(page.getByText('已删除“已修改的字典类型”及其字典值', { exact: true })).toBeVisible()
})

test('the final type page can be reached, resized, and deletion returns to a valid page', async ({
  page,
}) => {
  await page.goto('/test-fixtures/dict-book.html')
  const pager = page.getByRole('navigation', { name: '字典类型分页' })
  await expect(pager).toContainText('第 1-12 条，共 13 条')
  await pager.getByRole('combobox', { name: '每页条数', exact: true }).click()
  await page.getByRole('option', { name: '24', exact: true }).click()
  await expect(pager).toContainText('第 1-13 条，共 13 条')
  await expect(page.locator('.dict-card')).toHaveCount(13)

  await pager.getByRole('combobox', { name: '每页条数', exact: true }).click()
  await page.getByRole('option', { name: '12', exact: true }).click()
  await pager.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByRole('button', { name: /fixture_13/ }).click()
  const sheet = page.getByRole('dialog', { name: '类型 13', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('navigation', { name: '类型 13的字典值分页' })).toBeVisible()
  await sheet.getByRole('button', { name: '删除类型：类型 13', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(pager).toContainText('第 1-12 条，共 12 条')
  await expect(pager).toContainText('1 / 1')
  await expect(page.locator('.dict-card')).toHaveCount(12)
})

test('switching to the list view keeps actions in the header with no blank gap above filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/test-fixtures/dict-book.html')

  await page.getByRole('button', { name: '列表', exact: true }).click()

  const header = page.locator('[data-slot="page-header"]')
  const addType = header.getByRole('button', { name: '新增字典类型', exact: true })
  const refresh = header.getByRole('button', { name: '刷新数据', exact: true })
  await expect(addType).toBeVisible()
  await expect(refresh).toBeVisible()

  const tabs = page.getByRole('tablist')
  const searchForm = page.getByRole('form', { name: '筛选条件' })
  await expect(tabs).toBeVisible()
  await expect(searchForm).toBeVisible()
  await expect(page.getByRole('cell', { name: '类型 1', exact: true })).toBeVisible()

  const tabsBox = (await tabs.boundingBox())!
  const searchBox = (await searchForm.boundingBox())!
  expect(searchBox.y - (tabsBox.y + tabsBox.height)).toBeLessThanOrEqual(28)

  await page.getByRole('tab', { name: '字典数据', exact: true }).click()
  await expect(header.getByRole('button', { name: '新增字典数据', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '标签 / 键值', exact: true })).toBeVisible()
})
