import { useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router'

/**
 * Current page view from the `view` search parameter (replace navigation, so views do not pile up
 * in history). Unknown or unavailable values fall back to the first allowed view.
 */
export function usePageView<View extends string>(
  allowed: readonly View[],
  param = 'view',
): [View, (view: View) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const requested = searchParams.get(param)
  const view = allowed.find((candidate) => candidate === requested) ?? allowed[0]
  const setView = useCallback(
    (next: View) =>
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous)
          params.set(param, next)
          return params
        },
        { replace: true, state: location.state },
      ),
    [param, setSearchParams, location.state],
  )
  return [view, setView]
}
