import { expect, test, type Page } from '@playwright/test'

async function open(page: Page, focus = false) {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') })
  await page.goto(`/test-fixtures/role-resize.html${focus ? '?focus=1' : ''}`)
  await expect(page.getByRole('button', { name: '编辑业务授权', exact: true })).toBeVisible()
}
async function addPermission(page: Page) {
  await page.getByRole('button', { name: '编辑业务授权', exact: true }).click()
  await page.getByRole('button', { name: '候选权限', exact: true }).click()
  await page.getByRole('button', { name: '添加授权：读取用户', exact: true }).click()
}
async function setDate(page: Page, label: string, date: string) {
  await page.getByRole('button', { name: `${label} · UTC`, exact: true }).click()
  await page.locator(`[data-slot="popover-content"] [data-date="${date}"]`).click()
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole('button', { name: '确定', exact: true })
    .click()
}

test('an account handoff preserves the pending member and never chooses or grants a role automatically', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/test-fixtures/role-resize.html?memberContext')
  await expect(page.getByText('待处理账号：resize-user', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑成员关系', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '选择角色：Resize role', exact: true }).click()
  await expect(page.getByText('待处理账号：resize-user', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑成员关系', exact: true }).click()
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
  await expect(page.getByRole('button', { name: '审核变更', exact: true })).toBeDisabled()
})

test('each authorization-chain object arrives selected in its own relationship inspector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/test-fixtures/role-resize.html?linked')
  const relations = page.getByRole('group', { name: '角色关系', exact: true })
  await page.getByRole('button', { name: '角色成员：Resize member', exact: true }).click()
  await expect(page.getByRole('complementary')).toContainText('resize-user')
  await relations.getByRole('button', { name: '授权链', exact: true }).click()
  await page.getByRole('button', { name: '业务权限：读取用户', exact: true }).click()
  await expect(page.getByRole('complementary')).toContainText('system:user:list')
  await relations.getByRole('button', { name: '授权链', exact: true }).click()
  await page.getByRole('button', { name: '导航分配：用户导航', exact: true }).click()
  await expect(page.getByRole('complementary')).toContainText('/system/user')
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-permissions', '0')
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-navigation', '0')
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-members', '0')
})

test('resizing the real role workspace preserves permission scope and dates until saving', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await open(page)
  await addPermission(page)
  await page.getByRole('combobox', { name: '授权范围', exact: true }).click()
  await page.getByRole('option', { name: '本部门及下级部门', exact: true }).click()
  await page.getByRole('combobox', { name: '时间输入时区', exact: true }).click()
  await page.getByRole('option', { name: 'UTC', exact: true }).click()
  await setDate(page, '开始时间（含）', '2026-10-01')
  await setDate(page, '结束时间（不含）', '2026-10-31')
  await page.getByRole('button', { name: '审阅变更', exact: true }).click()
  for (const width of [390, 1280, 767, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.locator('.role-workspace-panels')).toHaveAttribute(
      'data-layout',
      width >= 1024 ? 'inline' : 'sheet',
    )
    if (width < 1024) await expect(page.getByRole('dialog')).toBeVisible()
    else await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '授权范围', exact: true })).toContainText(
      '本部门及下级部门',
    )
    await expect(
      page.getByRole('button', { name: '开始时间（含） · UTC', exact: true }),
    ).toContainText('2026-10-01 09:00')
    await expect(
      page.getByRole('button', { name: '结束时间（不含） · UTC', exact: true }),
    ).toContainText('2026-10-31 09:00')
    await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-permissions', '0')
    await page.getByRole('button', { name: '审阅变更', exact: true }).click()
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
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeHidden()
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  await expect(
    page
      .getByRole('group', { name: '角色关系' })
      .getByRole('button', { name: /^业务权限(?: · \d+)?$/ }),
  ).toBeVisible()
  expect(failures).toEqual([])
})

test('navigation editing survives desktop to mobile and saves the original revision delta', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: /^导航分配(?: · \d+)?$/ }).click()
  await page.getByRole('button', { name: '编辑导航分配', exact: true }).click()
  await page
    .getByRole('button', { name: '添加关联：用户导航，共 1 项（含上级）', exact: true })
    .click()
  await page.setViewportSize({ width: 390, height: 1000 })
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '审阅关联变更', exact: true }).click()
  await page.getByRole('button', { name: '确认并保存关联', exact: true }).click()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-navigation', '1')
  expect(JSON.parse((await page.getByTestId('resize-writes').getAttribute('data-body'))!)).toEqual({
    expectedRevision: '12',
    addIds: ['navigation-1'],
    removeIds: [],
  })
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  await expect(
    page
      .getByRole('group', { name: '角色关系' })
      .getByRole('button', { name: /^业务权限(?: · \d+)?$/ }),
  ).toBeVisible()
})

test('member editing survives desktop to mobile with its full assignment baseline', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: /^角色成员(?: · 可见 \d+)?$/ }).click()
  await page.getByRole('button', { name: '编辑成员关系', exact: true }).click()
  await page.getByRole('button', { name: '添加成员', exact: true }).click()
  await page.getByRole('button', { name: '添加成员关联：Resize member', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 1000 })
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '审核变更', exact: true }).click()
  await page.getByRole('button', { name: '保存成员关系', exact: true }).click()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-members', '1')
  expect(JSON.parse((await page.getByTestId('resize-writes').getAttribute('data-body'))!)).toEqual([
    'user-1',
  ])
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  await expect(
    page
      .getByRole('group', { name: '角色关系' })
      .getByRole('button', { name: /^业务权限(?: · \d+)?$/ }),
  ).toBeVisible()
})

test('a retained narrow-screen draft still clears immediately when authorization expires', async ({
  page,
}) => {
  await open(page)
  await addPermission(page)
  await page.setViewportSize({ width: 390, height: 1000 })
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: '审阅变更', exact: true })).toBeVisible()
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Invalidate authorization', exact: true }).click()
  await expect(page.getByRole('button', { name: '审阅变更', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeHidden()
  await expect(page.getByTestId('resize-writes')).toHaveAttribute('data-permissions', '0')
})

test('same-snapshot focus revalidation preserves a real scope/window draft, while a new snapshot clears it', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await open(page, true)
  await addPermission(page)
  await page.getByRole('combobox', { name: '授权范围', exact: true }).click()
  await page.getByRole('option', { name: '本部门及下级部门', exact: true }).click()
  await page.getByRole('combobox', { name: '时间输入时区', exact: true }).click()
  await page.getByRole('option', { name: 'UTC', exact: true }).click()
  await setDate(page, '开始时间（含）', '2026-10-01')
  await setDate(page, '结束时间（不含）', '2026-10-31')
  await page.getByRole('button', { name: '审阅变更', exact: true }).click()
  const status = page.getByTestId('resize-writes')
  const originalEpoch = await status.getAttribute('data-epoch')
  await expect(status).toHaveAttribute('data-snapshot', 'role-resize-fixture')
  for (const width of [1280, 390, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.locator('.role-workspace-panels')).toHaveAttribute(
      'data-layout',
      width >= 1024 ? 'inline' : 'sheet',
    )
    if (width < 1024) await expect(page.getByRole('dialog')).toBeVisible()
    else await expect(page.getByRole('dialog')).toHaveCount(0)
    const before = Number(await status.getAttribute('data-me-reads'))
    // Dispatch the browser's public focus event. Production startBrowserSessionSync,
    // ensureMe, authApi, request and Axios all run; only the server adapter is local.
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
    await expect(page.getByRole('combobox', { name: '授权范围', exact: true })).toContainText(
      '本部门及下级部门',
    )
    await expect(
      page.getByRole('button', { name: '开始时间（含） · UTC', exact: true }),
    ).toContainText('2026-10-01 09:00')
    await expect(
      page.getByRole('button', { name: '结束时间（不含） · UTC', exact: true }),
    ).toContainText('2026-10-31 09:00')
    await expect(status).toHaveAttribute('data-permissions', '0')
    await expect(status).toHaveAttribute('data-body', '')
    await page.getByRole('button', { name: '审阅变更', exact: true }).click()
  }
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
  await expect(page.getByRole('button', { name: '开始时间（含） · UTC', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '编辑业务授权', exact: true })).toBeHidden()
  await expect(status).toHaveAttribute('data-permissions', '0')
  await expect(status).toHaveAttribute('data-body', '')
  expect(failures).toEqual([])
})
