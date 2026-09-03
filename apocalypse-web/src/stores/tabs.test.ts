import { beforeEach, describe, expect, it } from 'vitest'

import { DASHBOARD_TAB, useTabsStore } from './tabs'

const userTab = { key: '/system/user', title: '用户管理' }
const roleTab = { key: '/system/role', title: '角色管理' }
const menuTab = { key: '/system/menu', title: '菜单管理' }

describe('tabs store', () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeKey: null })
  })

  it('打开业务页时自动固定工作台，关闭当前页后回工作台', () => {
    const store = useTabsStore.getState()
    store.open(userTab)

    expect(useTabsStore.getState()).toMatchObject({
      tabs: [DASHBOARD_TAB, userTab],
      activeKey: userTab.key,
    })
    expect(useTabsStore.getState().close(userTab.key)).toBe(DASHBOARD_TAB.key)
    expect(useTabsStore.getState()).toMatchObject({
      tabs: [DASHBOARD_TAB],
      activeKey: DASHBOARD_TAB.key,
    })
  })

  it('工作台页签不可关闭', () => {
    useTabsStore.getState().open(DASHBOARD_TAB)

    expect(useTabsStore.getState().close(DASHBOARD_TAB.key)).toBeNull()
    expect(useTabsStore.getState()).toMatchObject({
      tabs: [DASHBOARD_TAB],
      activeKey: DASHBOARD_TAB.key,
    })
  })

  it('首次登录的根路径重定向不会生成 Apocalypse 管理台别名页签', () => {
    const store = useTabsStore.getState()
    store.open({ key: '/', title: 'Apocalypse 管理台' })
    store.open({ key: '/dashboard', title: '工作台' })
    store.open({ key: '/dashboard/', title: 'Apocalypse 管理台' })

    expect(useTabsStore.getState()).toMatchObject({
      tabs: [DASHBOARD_TAB],
      activeKey: DASHBOARD_TAB.key,
    })
  })

  it('路由同步会清理热更新前残留的根路径别名页签', () => {
    useTabsStore.setState({
      tabs: [DASHBOARD_TAB, { key: '/', title: 'Apocalypse 管理台' }],
      activeKey: '/',
    })

    useTabsStore.getState().open(DASHBOARD_TAB)

    expect(useTabsStore.getState()).toMatchObject({
      tabs: [DASHBOARD_TAB],
      activeKey: DASHBOARD_TAB.key,
    })
  })

  it('关闭左侧或右侧页签时保留当前页和工作台', () => {
    const store = useTabsStore.getState()
    store.open(userTab)
    store.open(roleTab)
    store.open(menuTab)

    useTabsStore.getState().closeLeft(roleTab.key)
    expect(useTabsStore.getState().tabs).toEqual([DASHBOARD_TAB, roleTab, menuTab])

    useTabsStore.getState().closeRight(roleTab.key)
    expect(useTabsStore.getState().tabs).toEqual([DASHBOARD_TAB, roleTab])
  })

  it('关闭其他或全部页签时始终保留工作台', () => {
    const store = useTabsStore.getState()
    store.open(userTab)
    store.open(roleTab)

    useTabsStore.getState().closeOthers(roleTab.key)
    expect(useTabsStore.getState().tabs).toEqual([DASHBOARD_TAB, roleTab])

    useTabsStore.getState().closeAll()
    expect(useTabsStore.getState()).toMatchObject({
      tabs: [DASHBOARD_TAB],
      activeKey: DASHBOARD_TAB.key,
    })
  })

  it('后端撤回菜单后关闭失效页签并回到工作台', () => {
    const store = useTabsStore.getState()
    store.open(userTab)
    store.open(roleTab)

    useTabsStore.getState().retainAllowed([userTab.key])

    expect(useTabsStore.getState()).toMatchObject({
      tabs: [DASHBOARD_TAB, userTab],
      activeKey: DASHBOARD_TAB.key,
    })
  })
})
