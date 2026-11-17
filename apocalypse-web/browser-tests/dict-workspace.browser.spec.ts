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
  const card = page.locator('.dict-card[data-expanded="true"]')
  await expect(card).toContainText('fixture_new')
  await card.getByRole('button', { name: '新增值', exact: true }).click()
  await card.getByLabel('显示标签', { exact: true }).fill('处理中')
  await card.getByLabel('编码值', { exact: true }).fill('PENDING')
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card.locator('.dict-value-row')).toContainText('PENDING')
  await card.getByRole('button', { name: '编辑类型：可处理的字典类型', exact: true }).click()
  await card.getByLabel('字典类型编码', { exact: true }).fill('fixture_renamed')
  await card.getByLabel('字典名称', { exact: true }).fill('已修改的字典类型')
  await card.getByRole('button', { name: '保存类型', exact: true }).click()
  await page.getByRole('button', { name: '查看此类型', exact: true }).click()
  await expect(card).toContainText('fixture_renamed')
  await expect(card.locator('.dict-value-row')).toContainText('处理中')
  await card.getByRole('button', { name: '编辑：处理中', exact: true }).click()
  await card.getByLabel('显示标签', { exact: true }).fill('已处理')
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card.locator('.dict-value-row')).toContainText('已处理')
  await card.getByRole('button', { name: '删除类型：已修改的字典类型', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.dict-card')).toHaveCount(0)
  await expect(page.getByText('已删除“已修改的字典类型”及其字典值', { exact: true })).toBeVisible()
})

test('the final type page can be reached and deletion returns to a valid page', async ({
  page,
}) => {
  await page.goto('/test-fixtures/dict-book.html')
  await page
    .getByRole('navigation', { name: '字典类型分页' })
    .getByRole('button', { name: '下一页', exact: true })
    .click()
  await page.getByRole('button', { name: /fixture_13/ }).click()
  await page.getByRole('button', { name: '删除类型：类型 13', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('navigation', { name: '字典类型分页' })).toContainText('第 1 / 1 页')
  await expect(page.locator('.dict-card')).toHaveCount(12)
})
