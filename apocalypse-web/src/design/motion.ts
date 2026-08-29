/**
 * 通用管理台动效 token 的 motion 投影。
 * CSS 组件使用 tokens.css 中的毫秒值；JS 动效统一从这里取秒值与 easing。
 */

export const motionDuration = {
  feedback: 0.1,
  exit: 0.12,
  enter: 0.2,
  layer: 0.18,
  content: 0.24,
  standard: 0.18,
  panelExit: 0.16,
  panel: 0.3,
  surfaceReveal: 0.8,
} as const

export const motionEase = {
  enter: [0.16, 1, 0.3, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
} as const

/** 位移与缩放只表达层级关系，不承担装饰。单位分别为 CSS px 与无量纲比例。 */
export const motionGeometry = {
  pageOffset: 6,
  dialogScale: 0.92,
  sequenceOffset: 16,
  sequenceOvershoot: -3,
} as const

export const motionSequence = {
  delay: 0.46,
  stagger: 0.07,
} as const

/** motion/react 组件必须复用这些 transition，禁止在业务组件内另写 duration / ease。 */
export const motionTransition = {
  feedback: { duration: motionDuration.feedback, ease: motionEase.enter },
  enter: { duration: motionDuration.enter, ease: motionEase.enter },
  layerEnter: { duration: motionDuration.layer, ease: motionEase.enter },
  contentEnter: { duration: motionDuration.content, ease: motionEase.enter },
  exit: { duration: motionDuration.exit, ease: motionEase.exit },
  standard: { duration: motionDuration.standard, ease: motionEase.enter },
  panelEnter: { duration: motionDuration.panel, ease: motionEase.enter },
  panelExit: { duration: motionDuration.panelExit, ease: motionEase.exit },
  surfaceReveal: { duration: motionDuration.surfaceReveal, ease: motionEase.enter },
} as const
