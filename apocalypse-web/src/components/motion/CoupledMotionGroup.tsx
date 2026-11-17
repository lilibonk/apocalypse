import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useAuthStore } from '@/stores/auth'

export interface CoupledMotionState {
  /** Currently active trigger origin entity ID. */
  activeOriginId: string | null
  /** Monotonic pulse sequence incremented only on user-initiated changes (0 on initial mount). */
  pulseSeq: number
  /** Combined epoch key (`sessionEpoch:authorizationEpoch`) for instant security reset. */
  epochKey: string
  /** True when motion is enabled AND not resetting across security epochs. */
  motionAllowed: boolean
  /** Trigger a multi-channel coupled transition from the given origin entity ID. */
  triggerCoupledChange: (originId: string | null) => void
  /** Clear the active origin without emitting a pulse. */
  clearOrigin: () => void
}

const CoupledMotionContext = createContext<CoupledMotionState | null>(null)

export interface CoupledMotionGroupProps {
  initialOriginId?: string | null
  /** Controlled origin: when provided it is the active origin and follows the caller's selection. */
  activeId?: string | null
  children: ReactNode
}

interface InternalSnapshot {
  epochKey: string
  activeOriginId: string | null
  pulseSeq: number
}

/**
 * Coordinates the 240–500ms causal motion envelope across OriginAnchor, PathPulse,
 * FlipExpandCard, HudTransition, and MetricValue. Automatically silences pulses and
 * clears stale state on `sessionEpoch` or `authorizationEpoch` changes.
 */
export function CoupledMotionGroup({
  initialOriginId = null,
  activeId,
  children,
}: CoupledMotionGroupProps) {
  const motionPreferred = useMotionPreference()
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const epochKey = `${sessionEpoch}:${authorizationEpoch}`

  const [snapshot, setSnapshot] = useState<InternalSnapshot>(() => ({
    epochKey,
    activeOriginId: initialOriginId,
    pulseSeq: 0,
  }))

  const effectiveSnapshot =
    snapshot.epochKey === epochKey
      ? snapshot
      : {
          epochKey,
          activeOriginId: initialOriginId,
          pulseSeq: 0,
        }

  const triggerCoupledChange = useCallback(
    (originId: string | null) => {
      setSnapshot((prev) => {
        const baseSeq = prev.epochKey === epochKey ? prev.pulseSeq : 0
        return {
          epochKey,
          activeOriginId: originId,
          pulseSeq: originId ? baseSeq + 1 : baseSeq,
        }
      })
    },
    [epochKey],
  )

  const clearOrigin = useCallback(() => {
    setSnapshot((prev) => ({
      epochKey,
      activeOriginId: null,
      pulseSeq: prev.epochKey === epochKey ? prev.pulseSeq : 0,
    }))
  }, [epochKey])

  const value = useMemo<CoupledMotionState>(
    () => ({
      activeOriginId: activeId !== undefined ? activeId : effectiveSnapshot.activeOriginId,
      pulseSeq: effectiveSnapshot.pulseSeq,
      epochKey,
      motionAllowed: motionPreferred && snapshot.epochKey === epochKey,
      triggerCoupledChange,
      clearOrigin,
    }),
    [
      activeId,
      clearOrigin,
      effectiveSnapshot.activeOriginId,
      effectiveSnapshot.pulseSeq,
      epochKey,
      motionPreferred,
      snapshot.epochKey,
      triggerCoupledChange,
    ],
  )

  return <CoupledMotionContext.Provider value={value}>{children}</CoupledMotionContext.Provider>
}

export function useCoupledMotion(): CoupledMotionState {
  const ctx = useContext(CoupledMotionContext)
  const motionPreferred = useMotionPreference()
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const fallbackEpochKey = `${sessionEpoch}:${authorizationEpoch}`

  return useMemo<CoupledMotionState>(() => {
    if (ctx) return ctx
    return {
      activeOriginId: null,
      pulseSeq: 0,
      epochKey: fallbackEpochKey,
      motionAllowed: motionPreferred,
      triggerCoupledChange: () => undefined,
      clearOrigin: () => undefined,
    }
  }, [ctx, fallbackEpochKey, motionPreferred])
}
