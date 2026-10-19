/**
 * 通用管理台动效 token 的 motion 投影。
 * CSS 组件使用 tokens.css 中的毫秒值；JS 动效统一从这里取秒值与 easing。
 */

export const motionDuration = {
  feedback: 0.12,
  exit: 0.16,
  enter: 0.18,
  layer: 0.22,
  standard: 0.2,
  panelExit: 0.18,
  panel: 0.28,
} as const

export const motionEase = {
  enter: [0.16, 1, 0.3, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
} as const

/** 位移与缩放只表达层级关系，不承担装饰。单位分别为 CSS px 与无量纲比例。 */
export const motionGeometry = {
  pageOffset: 6,
} as const

/** motion/react 组件必须复用这些 transition，禁止在业务组件内另写 duration / ease。 */
export const motionTransition = {
  feedback: { duration: motionDuration.feedback, ease: motionEase.enter },
  enter: { duration: motionDuration.enter, ease: motionEase.enter },
  layerEnter: { duration: motionDuration.layer, ease: motionEase.enter },
  exit: { duration: motionDuration.exit, ease: motionEase.exit },
  standard: { duration: motionDuration.standard, ease: motionEase.enter },
  panelEnter: { duration: motionDuration.panel, ease: motionEase.enter },
  panelExit: { duration: motionDuration.panelExit, ease: motionEase.exit },
} as const

/** Dashboard / authorization insights: finite, interruptible movement; no looping decoration. */
export const insightMotion = {
  surface: { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 },
  layout: { type: 'spring', stiffness: 240, damping: 28, mass: 0.9 },
  chart: { duration: 0.48, ease: motionEase.enter },
  number: { duration: 0.6, ease: motionEase.enter },
  instant: { duration: 0 },
  stagger: 0.045,
  enterOffset: 14,
  hoverLift: 3,
} as const

/** The offline study retains the same approved motion vocabulary as its live counterparts. */
export const studyMotion = insightMotion

/**
 * 2026-10-18 reference-video adaptation. Values are product choices, not parameters recovered
 * from the video; each motion explains one business change and settles immediately when disabled.
 */
export const stateMotion = {
  /** Submit button collapse/expand and the detail origin ghost. */
  morph: { duration: 0.24, ease: motionEase.enter },
  /** First-entry "bounce home" for insight cards; refreshes never replay it. */
  entrance: { type: 'spring', stiffness: 300, damping: 22, mass: 0.85 },
  entranceScale: 0.96,
  /** One odometer column; neighbouring columns start `odometerStagger` seconds apart. */
  odometer: { duration: 0.48, ease: motionEase.enter },
  odometerStagger: 0.03,
  /** Overview / organisation graph first growth. Total stays below `growthBudget`. */
  growth: { duration: 0.36, ease: motionEase.enter },
  growthStagger: 0.06,
  growthBudget: 0.7,
  /** Selected ancestor path: one travelling pulse, never a loop. */
  pathPulse: { duration: 0.52, ease: motionEase.enter },
  /** Heatmap reveal: column delay and single-cell fade. */
  heatColumnDelay: 0.012,
  heatCell: { duration: 0.18, ease: motionEase.enter },
  /** Neighbours yielding to an expanded card reuse the approved layout spring. */
  yieldLayout: insightMotion.layout,
  /** Focus dimming of unrelated graph branches. */
  dimOpacity: 0.35,
} as const
