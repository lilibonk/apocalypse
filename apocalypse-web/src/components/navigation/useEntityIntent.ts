import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

import {
  ENTITY_PRIMARY_PARAM,
  readEntityIntent,
  type EntityKind,
  type EntityRouteIntent,
} from './entity-intent'

export interface UseEntityIntentResult {
  /** Resolved entity route intent (undefined when no cross-page intent is active). */
  intent: EntityRouteIntent | undefined
  /** Clears the one-shot `triggerPulse` flag from History State while preserving URL SearchParams. */
  clearPulse: () => void
  /** Clears both the URL focus parameters and the History State intent. */
  clearIntent: () => void
}

/**
 * Target workspace hook for consuming cross-page `EntityRouteIntent` from URL SearchParams
 * and `location.state.entityIntent`.
 */
export function useEntityIntent(expectedKind?: EntityKind): UseEntityIntentResult {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const intent = useMemo(
    () => readEntityIntent(searchParams, location.state, expectedKind),
    [expectedKind, location.state, searchParams],
  )

  const clearPulse = useCallback(() => {
    if (!intent?.triggerPulse) return
    navigate(
      { pathname: location.pathname, search: location.search },
      {
        replace: true,
        state: {
          ...(location.state && typeof location.state === 'object' ? location.state : {}),
          entityIntent: {
            ...intent,
            triggerPulse: false,
          },
        },
      },
    )
  }, [intent, location.pathname, location.search, location.state, navigate])

  const clearIntent = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('focusId')
    next.delete('focus')
    next.delete('relation')
    next.delete('roleRelation')
    if (expectedKind) {
      next.delete(ENTITY_PRIMARY_PARAM[expectedKind])
    }
    setSearchParams(next, { replace: true })
  }, [expectedKind, searchParams, setSearchParams])

  return { intent, clearPulse, clearIntent }
}
