import { useEffect, useMemo } from 'react'
import { useAnimationControls, type TargetAndTransition, type Transition } from 'motion/react'

/**
 * Geometry/SVG presentation only. Stop and settle immediately when motion is disabled.
 * Targets and transitions must be serializable values, not callbacks or MotionValues.
 */
export function useSurfaceAnimation(
  target: TargetAndTransition,
  enabled: boolean,
  transition: Transition,
) {
  const controls = useAnimationControls()
  const targetKey = JSON.stringify(target)
  const transitionKey = JSON.stringify(transition)
  const stableTarget = useMemo(() => JSON.parse(targetKey) as TargetAndTransition, [targetKey])
  const stableTransition = useMemo(() => JSON.parse(transitionKey) as Transition, [transitionKey])

  useEffect(() => {
    controls.stop()
    if (enabled) void controls.start(stableTarget, stableTransition)
    else controls.set(stableTarget)
    return () => controls.stop()
  }, [controls, enabled, stableTarget, stableTransition])

  return controls
}
