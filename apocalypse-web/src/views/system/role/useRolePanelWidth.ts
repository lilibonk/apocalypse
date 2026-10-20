import { useLayoutEffect, useState, type RefObject } from 'react'

const minimumRem = { locator: 68, inspector: 50 } as const
type RolePanel = keyof typeof minimumRem

export function rolePanelFits(width: number, rootFontSize: number, panel: RolePanel): boolean {
  return width >= minimumRem[panel] * rootFontSize
}

/** Role-local layout uses available content width, including a collapsed application sidebar. */
export function useRolePanelWidth(ref: RefObject<HTMLElement | null>, panel: RolePanel) {
  const [wide, setWide] = useState(true)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const style = getComputedStyle(element)
      const width =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize)
      setWide(rolePanelFits(width, rootFontSize, panel))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [panel, ref])
  return wide
}
