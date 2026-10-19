import type { LoginHeatmapCell } from '@/views/system/log/log-insight.api'

/** Failure concentration rule shown in the legend: at least this many failures … */
export const FAILURE_MIN = 3
/** … making up at least this share of the cell's sign-ins. */
export const FAILURE_RATIO = 0.2

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** Level 0 is a recorded zero; uncovered cells are handled separately and never get a level. */
export function heatLevel(total: number, max: number): HeatLevel {
  if (total <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((total / max) * 4))) as HeatLevel
}

export function failureConcentrated(cell: Pick<LoginHeatmapCell, 'total' | 'failed'>): boolean {
  return cell.failed >= FAILURE_MIN && cell.total > 0 && cell.failed / cell.total >= FAILURE_RATIO
}

/** Rows Monday→Sunday, each with 24 hourly cells; missing cells become uncovered placeholders. */
export function heatmapRows(cells: readonly LoginHeatmapCell[]): LoginHeatmapCell[][] {
  const lookup = new Map(cells.map((cell) => [`${cell.isoWeekday}:${cell.hour}`, cell]))
  return Array.from({ length: 7 }, (_, row) =>
    Array.from(
      { length: 24 },
      (_, hour) =>
        lookup.get(`${row + 1}:${hour}`) ?? {
          isoWeekday: row + 1,
          hour,
          total: 0,
          failed: 0,
          slots: 0,
        },
    ),
  )
}

/** Next focus position for arrow/Home/End keys inside the 7×24 grid. */
export function moveCell(
  position: { row: number; column: number },
  key: string,
): { row: number; column: number } | null {
  const { row, column } = position
  switch (key) {
    case 'ArrowLeft':
      return { row, column: Math.max(0, column - 1) }
    case 'ArrowRight':
      return { row, column: Math.min(23, column + 1) }
    case 'ArrowUp':
      return { row: Math.max(0, row - 1), column }
    case 'ArrowDown':
      return { row: Math.min(6, row + 1), column }
    case 'Home':
      return { row, column: 0 }
    case 'End':
      return { row, column: 23 }
    default:
      return null
  }
}
