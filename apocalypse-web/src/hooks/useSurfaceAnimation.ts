import { useEffect, useRef } from 'react'
import { useAnimationControls, type TargetAndTransition, type Transition } from 'motion/react'

/**
 * 递归结构相等比较（替代 JSON.stringify/parse，消除每帧前临时字符串与对象克隆分配）。
 */
export function isSameMotionValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => isSameMotionValue(item, b[index]))
  }
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  const recordA = a as Record<string, unknown>
  const recordB = b as Record<string, unknown>
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(recordB, key) &&
      isSameMotionValue(recordA[key], recordB[key]),
  )
}

/**
 * Geometry/SVG presentation only. Stop and settle immediately when motion is disabled.
 * Targets and transitions must be plain values, not callbacks or MotionValues.
 */
export function useSurfaceAnimation(
  target: TargetAndTransition,
  enabled: boolean,
  transition: Transition,
) {
  const controls = useAnimationControls()
  const appliedRef = useRef<{
    enabled: boolean
    target: TargetAndTransition
    transition: Transition
  } | null>(null)

  useEffect(() => {
    const previous = appliedRef.current
    if (
      previous &&
      previous.enabled === enabled &&
      isSameMotionValue(previous.target, target) &&
      isSameMotionValue(previous.transition, transition)
    ) {
      return
    }
    appliedRef.current = { enabled, target, transition }
    controls.stop()
    if (enabled) void controls.start(target, transition)
    else controls.set(target)
  }, [controls, enabled, target, transition])

  useEffect(
    () => () => {
      controls.stop()
      // React can replay effects while preserving refs. A stopped animation must restart.
      appliedRef.current = null
    },
    [controls],
  )

  return controls
}
