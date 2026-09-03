/**
 * i18n 接线位：react-i18next 初始化。
 *
 * - zh 为默认与兜底语言；核心词条与业务模块词条分别维护。
 * - 业务模块通过 views/<module>/i18n/index.ts 自动贡献独立 namespace 与菜单翻译。
 * - 语言切换：app/providers.tsx 监听 settings.language → i18n.changeLanguage。
 * - 菜单名渲染约定：t(`menu.${菜单名}`, { defaultValue: 菜单名 })，
 *   未登记的菜单名自动兜底后端原文（见 hooks/useMenuTitle.ts）。
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { appI18nResources } from './module-loader'

void i18n.use(initReactI18next).init({
  resources: appI18nResources.resources,
  ns: appI18nResources.namespaces,
  defaultNS: 'translation',
  lng: 'zh',
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

export default i18n
