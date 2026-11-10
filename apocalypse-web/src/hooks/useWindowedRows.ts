import { useCallback, useMemo, useState, type UIEvent } from 'react'

export interface WindowedRowsOptions {
  /** 行数超过该阈值时才启用视口窗口化切片（默认 100）。 */
  threshold?: number
  /** 单行预估高度（px，默认 44）。 */
  rowHeight?: number
  /** 视口容器高度（px，默认 560）。 */
  viewportHeight?: number
  /** 上下额外缓冲行数（默认 10）。 */
  overscan?: number
}

export interface WindowedRowsResult<T> {
  windowed: boolean
  visibleRows: readonly T[]
  startIndex: number
  endIndex: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  maxHeight: number | undefined
  onScroll: ((event: UIEvent<HTMLElement>) => void) | undefined
}

export function computeWindowedSlice<T>(
  rows: readonly T[],
  scrollTop: number,
  options: Required<WindowedRowsOptions>,
): Omit<WindowedRowsResult<T>, 'onScroll'> {
  const total = rows.length
  if (total <= options.threshold) {
    return {
      windowed: false,
      visibleRows: rows,
      startIndex: 0,
      endIndex: total,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      maxHeight: undefined,
    }
  }
  const rawStart = Math.floor(Math.max(0, scrollTop) / options.rowHeight)
  const visibleCount = Math.ceil(options.viewportHeight / options.rowHeight)
  const startIndex = Math.max(0, rawStart - options.overscan)
  const endIndex = Math.min(total, rawStart + visibleCount + options.overscan)
  return {
    windowed: true,
    visibleRows: rows.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * options.rowHeight,
    bottomSpacerHeight: Math.max(0, (total - endIndex) * options.rowHeight),
    maxHeight: options.viewportHeight,
  }
}

/**
 * 零外部依赖的长树/长列表视口切片兜底（M5）：
 * 当节点数 <= threshold（默认 100）时完全透明直出；超出阈值时仅挂载视口附近行。
 */
export function useWindowedRows<T>(
  rows: readonly T[],
  options: WindowedRowsOptions = {},
): WindowedRowsResult<T> {
  const threshold = options.threshold ?? 100
  const rowHeight = options.rowHeight ?? 44
  const viewportHeight = options.viewportHeight ?? 560
  const overscan = options.overscan ?? 10
  const [scrollTop, setScrollTop] = useState(0)

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  const slice = useMemo(
    () =>
      computeWindowedSlice(rows, scrollTop, {
        threshold,
        rowHeight,
        viewportHeight,
        overscan,
      }),
    [rows, scrollTop, threshold, rowHeight, viewportHeight, overscan],
  )

  return {
    ...slice,
    onScroll: slice.windowed ? onScroll : undefined,
  }
}
