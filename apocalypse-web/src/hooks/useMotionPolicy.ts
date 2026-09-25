import { useReducedMotion } from 'motion/react'
import { useSettings } from '@/stores/settings'

export interface MotionPolicy {
  /** 动效总开关：当且仅当设置启用且系统未请求减少动效时为 true */
  motionActive: boolean
  /** 用户在设置面板中的手动开关状态 */
  motionEnabled: boolean
  /** 操作系统级别 prefers-reduced-motion 是否激活 */
  reducedMotion: boolean
}

/**
 * 全局动效策略单一事实源 Hook。
 * 遵循 AGENTS.md 动效治理：
 * - 结合应用层设置（html[data-motion='off'] / settings.motionEnabled）
 * - 结合系统级偏好（prefers-reduced-motion: reduce）
 */
export function useMotionPolicy(): MotionPolicy {
  const { motionEnabled } = useSettings()
  const reducedMotion = Boolean(useReducedMotion())

  const motionActive = motionEnabled && !reducedMotion

  return {
    motionActive,
    motionEnabled,
    reducedMotion,
  }
}
