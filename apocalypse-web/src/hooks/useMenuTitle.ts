/**
 * 菜单名 i18n：t(`menu.${原文}`) 命中词条则翻译，未登记兜底后端原文。
 * 侧栏 / 顶栏 / 命令面板 / 页签标题统一走这里。
 */

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export function useMenuTitle(): (menuName: string) => string {
  const { t } = useTranslation()
  return useCallback((menuName: string) => t(`menu.${menuName}`, { defaultValue: menuName }), [t])
}
