import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Event handler with a stable identity that always runs the latest closure. Only for handlers
 * invoked from events or effects, never during render (a render-time call would see the previous
 * closure). Lets memoised children such as DynaTable skip re-rendering when a page opens a layer.
 */
export function useStableCallback<Args extends unknown[], Result>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(handler)
  useLayoutEffect(() => {
    latest.current = handler
  })
  return useCallback((...args: Args) => latest.current(...args), [])
}
