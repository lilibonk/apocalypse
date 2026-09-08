/** Frame sampling reports submitted render frames, not a claimed GPU presentation timestamp. */
export interface FrameReport {
  frames: number
  elapsedMs: number
  averageFps: number
  p95FrameMs: number
  framesOver25Ms: number
}

export function summarizeFrames(intervals: readonly number[]): FrameReport {
  const valid = intervals.filter((value) => Number.isFinite(value) && value > 0)
  if (valid.length === 0) {
    return { frames: 0, elapsedMs: 0, averageFps: 0, p95FrameMs: 0, framesOver25Ms: 0 }
  }
  const sorted = [...valid].sort((a, b) => a - b)
  const elapsedMs = valid.reduce((total, value) => total + value, 0)
  return {
    frames: valid.length,
    elapsedMs,
    averageFps: (valid.length * 1000) / elapsedMs,
    p95FrameMs: sorted[Math.ceil(sorted.length * 0.95) - 1],
    framesOver25Ms: valid.filter((value) => value > 25).length,
  }
}
