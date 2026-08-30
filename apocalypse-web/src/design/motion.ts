/**
 * 通用管理台动效 token 的 motion 投影。
 * CSS 组件使用 tokens.css 中的毫秒值；JS 动效统一从这里取秒值与 easing。
 */

export const motionDuration = {
  feedback: 0.1,
  exit: 0.12,
  enter: 0.2,
  layer: 0.18,
  standard: 0.18,
  panelExit: 0.16,
  panel: 0.3,
  dialogReveal: 0.5,
} as const

export const motionEase = {
  enter: [0.16, 1, 0.3, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  reveal: 'linear' as const,
} as const

/** 位移与缩放只表达层级关系，不承担装饰。单位分别为 CSS px 与无量纲比例。 */
export const motionGeometry = {
  pageOffset: 6,
  dialogScale: 0.965,
  dialogOvershoot: 1.008,
  dialogContentOffset: 8,
} as const

/** CRUD Dialog 单时间轴中的绝对落点，避免遮罩、外壳与内容各自累计 delay。 */
export const dialogMotionSequence = {
  overlayAt: 0,
  surfaceAt: 0.02,
  headerAt: 0.1,
  bodyAt: 0.15,
  footerAt: 0.22,
} as const

/**
 * CRUD 内容的固定像素波前。每一帧拥有相同数量的 polygon 顶点，浏览器才能连续插值；
 * 八个水平分区的推进距离刻意不一致，形成确定但不规则的块状前沿。
 */
const dialogWaveRows = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100] as const

function dialogWavePolygon(frontier: readonly number[]) {
  const points = [`0% 0%`, `${frontier[0]}% 0%`]
  for (let index = 1; index < dialogWaveRows.length; index += 1) {
    points.push(`${frontier[index - 1]}% ${dialogWaveRows[index]}%`)
    points.push(`${frontier[index]}% ${dialogWaveRows[index]}%`)
  }
  points.push('0% 100%')
  return `polygon(${points.join(', ')})`
}

export const dialogPixelWaveClipPaths = [
  dialogWavePolygon([0, 0, 0, 0, 0, 0, 0, 0, 0]),
  dialogWavePolygon([18, 28, 14, 32, 22, 36, 16, 30, 20]),
  dialogWavePolygon([56, 70, 48, 66, 54, 76, 50, 68, 58]),
  dialogWavePolygon([88, 100, 84, 96, 90, 100, 86, 98, 92]),
  dialogWavePolygon([100, 100, 100, 100, 100, 100, 100, 100, 100]),
] as const

/** motion/react 组件必须复用这些 transition，禁止在业务组件内另写 duration / ease。 */
export const motionTransition = {
  feedback: { duration: motionDuration.feedback, ease: motionEase.enter },
  enter: { duration: motionDuration.enter, ease: motionEase.enter },
  layerEnter: { duration: motionDuration.layer, ease: motionEase.enter },
  exit: { duration: motionDuration.exit, ease: motionEase.exit },
  standard: { duration: motionDuration.standard, ease: motionEase.enter },
  panelEnter: { duration: motionDuration.panel, ease: motionEase.enter },
  panelExit: { duration: motionDuration.panelExit, ease: motionEase.exit },
  dialogReveal: { duration: motionDuration.dialogReveal, ease: motionEase.reveal },
} as const
