import { expect, test, type Page } from '@playwright/test'

async function open(page: Page, focus = false) {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') })
  await page.goto(`/test-fixtures/role-resize.html${focus ? '?focus=1' : ''}`)
  await expect(
    page.getByRole('checkbox', { name: '添加授权：读取用户', exact: true }),
  ).toBeVisible()
}

async function addPermission(page: Page) {
  await page.getByRole('checkbox', { name: '添加授权：读取用户', exact: true }).check()
}

async function setDate(page: Page, label: string, date: string) {
  await page.getByRole('button', { name: `${label} · UTC`, exact: true }).click()
  await page.locator(`[data-slot="popover-content"] [data-date="${date}"]`).click()
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole('button', { name: '确定', exact: true })
    .click()
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test('an account handoff preserves the pending member and never chooses or grants a role automatically', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/test-fixtures/role-resize.html?memberContext')
  await expect(page.getByText('待处理账号：resize-user', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存成员关系', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '授权配置', exact: true }).first().click()
  await expect(page.getByText('待处理账号：resize-user', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: '搜索用户名或显示名称', exact: true }),
  ).toHaveValue('resize-user')
  await expect(page.getByTestId('resize-writes')).toHaveAttribute(
    'data-candidate-keyword',
    'resize-user',
  )
  await expect(
    page.getByRole('button', { name: '添加成员关联：Resize member', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-members', '0')
})

test('drill-down role workbench opens tabs cleanly and navigates back to role list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/test-fixtures/role-resize.html?linked')
  await expect(page.getByRole('heading', { name: 'Resize role' })).toBeVisible()
  await expect(page.getByText('system:user:list', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: /导航分配/ }).click()
  await expect(page.getByText('用户导航', { exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /移除关联：用户导航/ })).toBeChecked()

  await page.getByRole('tab', { name: /角色成员/ }).click()
  await expect(page.getByText('resize-user', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '返回角色列表', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('button', { name: '授权配置', exact: true })).toBeVisible()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-permissions', '0')
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-navigation', '0')
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-members', '0')
})

test('resizing the real role workbench preserves permission scope and dates until saving', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await open(page)
  await addPermission(page)

  await page.getByRole('combobox', { name: '授权范围：读取用户', exact: true }).click()
  await page.getByRole('option', { name: '本部门及下级部门', exact: true }).click()

  await page.getByRole('button', { name: '设置有效期与规则：读取用户', exact: true }).click()
  await page.getByRole('combobox', { name: '时间输入时区', exact: true }).click()
  await page.getByRole('option', { name: 'UTC', exact: true }).click()
  await setDate(page, '开始时间（含）', '2026-10-01')
  await setDate(page, '结束时间（不含）', '2026-10-31')
  await page.getByRole('button', { name: '完成', exact: true }).click()

  await page.getByRole('button', { name: '审阅并保存', exact: true }).click()
  for (const width of [390, 1280, 767, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expectNoHorizontalOverflow(page)
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()

    await expect(
      page.getByRole('combobox', { name: '授权范围：读取用户', exact: true }),
    ).toContainText('本部门及下级部门')
    await page.getByRole('button', { name: '设置有效期与规则：读取用户', exact: true }).click()
    await expect(
      page.getByRole('button', { name: '开始时间（含） · UTC', exact: true }),
    ).toContainText('2026-10-01 09:00')
    await expect(
      page.getByRole('button', { name: '结束时间（不含） · UTC', exact: true }),
    ).toContainText('2026-10-31 09:00')
    await page.getByRole('button', { name: '完成', exact: true }).click()

    await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-permissions', '0')
    await page.getByRole('button', { name: '审阅并保存', exact: true }).click()
  }

  await page.getByRole('button', { name: '保存授权', exact: true }).click()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-permissions', '1')
  const body = JSON.parse((await page.getByTestId('resize-writes').getAttribute('data-body'))!)
  expect(body).toEqual({
    expectedRevision: '12',
    expectedCatalogRevision: '9',
    upsert: [
      {
        permissionId: 'permission-1',
        enabled: true,
        scopeOverride: 'DEPT_AND_CHILDREN',
        validFrom: '2026-10-01T09:00:00.000Z',
        validUntil: '2026-10-31T09:00:00.000Z',
      },
    ],
    remove: [],
  })
  expect(failures).toEqual([])
})

test('navigation tree editing survives desktop to mobile and saves the original revision delta', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('tab', { name: /导航分配/ }).click()
  await page.getByRole('checkbox', { name: /添加关联：用户导航/ }).check()
  await page.setViewportSize({ width: 390, height: 1000 })
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: '审阅并保存', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '保存导航', exact: true }).click()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-navigation', '1')
  expect(JSON.parse((await page.getByTestId('resize-writes').getAttribute('data-body'))!)).toEqual({
    expectedRevision: '12',
    addIds: ['navigation-1'],
    removeIds: [],
  })
})

test('member editing survives desktop to mobile with its full assignment baseline', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('tab', { name: /角色成员/ }).click()
  await page.getByRole('button', { name: '添加成员', exact: true }).click()
  await page.getByRole('button', { name: '添加成员关联：Resize member', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 1000 })
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '审核变更', exact: true }).click()
  await page.getByRole('button', { name: '保存成员关系', exact: true }).click()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-members', '1')
  expect(JSON.parse((await page.getByTestId('resize-writes').getAttribute('data-body'))!)).toEqual([
    'user-1',
  ])
})

test('a retained draft clears and locks immediately when authorization expires', async ({
  page,
}) => {
  await open(page)
  await addPermission(page)
  await page.setViewportSize({ width: 390, height: 1000 })
  await expect(page.getByRole('button', { name: '审阅并保存', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Invalidate authorization', exact: true }).click()
  await expect(page.getByRole('button', { name: '审阅并保存', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeHidden()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-permissions', '0')
})

test('same-snapshot focus revalidation preserves a scope/window draft, while a narrower snapshot clears it', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await open(page, true)
  await addPermission(page)
  await page.getByRole('combobox', { name: '授权范围：读取用户', exact: true }).click()
  await page.getByRole('option', { name: '本部门及下级部门', exact: true }).click()
  await page.getByRole('button', { name: '设置有效期与规则：读取用户', exact: true }).click()
  await page.getByRole('combobox', { name: '时间输入时区', exact: true }).click()
  await page.getByRole('option', { name: 'UTC', exact: true }).click()
  await setDate(page, '开始时间（含）', '2026-10-01')
  await setDate(page, '结束时间（不含）', '2026-10-31')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '审阅并保存', exact: true }).click()

  const status = page.getByTestId('resize-writes')
  const originalEpoch = await status.getAttribute('data-epoch')
  await expect(status).toHaveAttribute('data-snapshot', 'role-resize-fixture')
  for (const width of [1280, 390, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    const before = Number(await status.getAttribute('data-me-reads'))
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
    })
    await page.clock.runFor(1100)
    await expect(status).toHaveAttribute('data-me-reads', String(before + 1))
    await expect(status).toHaveAttribute('data-loaded', 'true')
    await expect(status).toHaveAttribute('data-epoch', originalEpoch!)
    await expect(status).toHaveAttribute('data-snapshot', 'role-resize-fixture')
    await expect(status).toHaveAttribute('data-can-write', 'true')
    await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    await expect(
      page.getByRole('combobox', { name: '授权范围：读取用户', exact: true }),
    ).toContainText('本部门及下级部门')
    await expect(status).toHaveAttribute('data-permissions', '0')
    await page.getByRole('button', { name: '审阅并保存', exact: true }).click()
  }

  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  const beforeChange = Number(await status.getAttribute('data-me-reads'))
  await page
    .getByRole('button', { name: 'Return narrower snapshot on next focus', exact: true })
    .click()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.clock.runFor(1100)
  await expect(status).toHaveAttribute('data-me-reads', String(beforeChange + 1))
  await expect(status).toHaveAttribute('data-snapshot', 'role-resize-fixture-dept')
  await expect(status).not.toHaveAttribute('data-epoch', originalEpoch!)
  await expect(status).toHaveAttribute('data-loaded', 'true')
  await expect(status).toHaveAttribute('data-can-write', 'false')
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '审阅并保存', exact: true })).toBeHidden()
  await expect(
    page.getByRole('checkbox', { name: '添加授权：读取用户', exact: true }),
  ).toBeDisabled()
  await expect(status).toHaveAttribute('data-permissions', '0')
  expect(failures).toEqual([])
})
