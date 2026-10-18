import { useEffect, useMemo } from 'react'
import { useAnimationControls, type TargetAndTransition, type Transition } from 'motion/react'

/** Local study primitive: turning motion off also stops an animation already in flight. */
export function useStudyAnimation(
  target: TargetAndTransition,
  enabled: boolean,
  transition: Transition,
) {
  const controls = useAnimationControls()
  // Study targets are serializable scalar geometry / SVG paths, never callbacks or MotionValues.
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
