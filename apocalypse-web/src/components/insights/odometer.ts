/**
 * Odometer column model. Columns are keyed from the right so the units digit keeps its identity
 * when the digit count grows or shrinks (9 → 10, 1,000 → 999); separators, signs and units are
 * static glyphs. The formatter is the caller's locale formatter, so grouping and decimals follow it.
 */
export interface OdometerColumn {
  key: string
  /** Rendered glyph. */
  char: string
  /** 0–9 for reel columns, null for static glyphs. */
  digit: number | null
  /** Distance from the rightmost glyph; used to stagger reels from the right. */
  fromRight: number
}

export function odometerColumns(formatted: string): OdometerColumn[] {
  const glyphs = Array.from(formatted)
  return glyphs.map((char, index) => {
    const fromRight = glyphs.length - 1 - index
    const digit = /^[0-9]$/.test(char) ? Number(char) : null
    return {
      key: `${digit === null ? 's' : 'd'}${fromRight}`,
      char,
      digit,
      fromRight,
    }
  })
}

/** Stagger in seconds for a reel column; neighbouring reels start `stagger` apart from the right. */
export function odometerDelay(column: OdometerColumn, stagger: number): number {
  return column.digit === null ? 0 : column.fromRight * stagger
}
