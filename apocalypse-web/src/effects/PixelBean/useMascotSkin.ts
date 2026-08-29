/**
 * @deprecated 已弃用（历史兼容保留），新代码禁止引用，见 docs/pixel-wave-spec.md。
 *
 * 吉祥物皮肤读写入口：设置面板「吉祥物」能力项的数据钩子。
 * 读 stores/settings 的 mascotSkin（persist）；组件默认皮肤见 PixelBean.tsx。
 */

import { useSettingsStore } from '@/stores/settings'

import type { SkinId } from './types'

export function useMascotSkin(): { skin: SkinId; setSkin: (s: SkinId) => void } {
  const skin = useSettingsStore((s) => s.mascotSkin)
  const setSkin = useSettingsStore((s) => s.setMascotSkin)
  return { skin, setSkin }
}
