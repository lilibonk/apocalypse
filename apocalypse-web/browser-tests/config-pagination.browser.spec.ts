import { expect, test } from '@playwright/test'

test('parameter drafts span server pages and searches, then rebase and save as one atomic batch', async ({
  page,
}) => {
  await page.goto('/test-fixtures/video-surfaces.html?surface=config&manyConfigs')
  await page.getByLabel('主题', { exact: true }).fill('dim')
  const pager = page.getByRole('navigation', { name: '参数分页' })
  await expect(pager).toContainText('第 1–20 项，共 206 项')
  await pager.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByLabel('参数 21', { exact: true }).fill('changed-21')
  await expect(page.getByText('2 项未保存', { exact: true })).toBeVisible()
  await expect(pager).toContainText('第 21–40 项，共 206 项')

  // The result exists beyond the former fixed 200-row window.
  await page.getByLabel('搜索参数键或名称', { exact: true }).fill('参数 206')
  await page.getByLabel('参数 206', { exact: true }).fill('changed-206')
  await expect(pager).toContainText('第 1–1 项，共 1 项')
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  const review = page.getByRole('dialog', { name: '待保存的修改' })
  for (const name of ['主题', '参数 21', '参数 206'])
    await expect(review.getByText(name, { exact: true })).toBeVisible()
  await expect(review.getByText('original-21', { exact: true })).toBeVisible()
  await expect(review.getByText('changed-206', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: '返回编辑', exact: true }).click()

  await page.getByRole('button', { name: 'Change theme elsewhere', exact: true }).click()
  await page.getByRole('button', { name: '保存改动', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('参数已被他人修改')
  await expect(page.getByText('3 项未保存', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '载入最新值并保留我的修改', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  await expect(review.getByText('dark', { exact: true })).toBeVisible()
  await expect(review.getByText('changed-21', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: '返回编辑', exact: true }).click()
  await page.getByRole('button', { name: '保存改动', exact: true }).click()
  await expect(page.getByTestId('fixture-saves')).toHaveAttribute('data-count', '2')
  await expect(page.getByRole('region', { name: '未保存修改' })).toHaveCount(0)
  const saved = JSON.parse(
    (await page.getByTestId('fixture-saves').getAttribute('data-body')) ?? '[]',
  ) as { id: string; expectedVersion: number; configValue: string }[]
  expect(saved).toEqual([
    { id: 'c1', expectedVersion: 2, configValue: 'dim' },
    { id: 'c21', expectedVersion: 1, configValue: 'changed-21' },
    { id: 'c206', expectedVersion: 1, configValue: 'changed-206' },
  ])
  await page.getByLabel('搜索参数键或名称', { exact: true }).fill('frame.theme')
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('dim')
  await expect(page.locator('.config-row[data-saved]')).toHaveCount(1)
})
