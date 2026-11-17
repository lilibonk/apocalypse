/**
 * 全站物理动效单一真源（Unified Causal Physics Motion Tokens）。
 * CSS 组件使用 tokens.css 中的毫秒值；JS 动效统一从 unifiedMotion = { tactile, spatial, causal } 取值。
 * 历史命名空间（motionDuration / motionTransition / insightMotion / stateMotion / coupledMotion）
 * 全部由 unifiedMotion 同源派生，零数值分叉。
 */

export const motionEase = {
  /** 标准进入：快速响应、柔和落位，严禁过冲抖动。 */
  enter: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** 标准退出：干脆收起，不拖泥带水。 */
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  /** FLIP 几何让位与自适应高度呼吸曲线。 */
  flip: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const

/** 位移与缩放只表达层级关系，不承担装饰。单位分别为 CSS px 与无量纲比例。 */
export const motionGeometry = {
  pageOffset: 6,
  enterOffset: 10,
  hoverLift: 2,
} as const

/**
 * 三阶因果物理动效单一真源：
 * 1. tactile (120ms–180ms): 触觉微反馈、Popover、来源锚定锁定、自适应高度呼吸
 * 2. spatial (160ms–380ms): 空间层过渡、Dialog/Sheet、HUD 切换、单边界 FLIP 几何让位
 * 3. causal  (320ms–460ms): 因果叙事包络、首屏生长、SVG 一次性路径脉冲、Hero Odometer 滚轮
 */
export const unifiedMotion = {
  tactile: {
    /** 按钮、Tab、行悬停、胶囊微反馈 (120ms) */
    feedback: { duration: 0.12, ease: motionEase.enter },
    /** Channel 1: 触发源锚定锁定 (150ms) */
    anchor: { duration: 0.15, ease: motionEase.enter },
    /** Popover / Select / Dropdown / Tooltip 浮入 (180ms) */
    popoverEnter: { duration: 0.18, ease: motionEase.enter },
    /** Popover / Select / Dropdown / Tooltip 收起 (140ms) */
    popoverExit: { duration: 0.14, ease: motionEase.exit },
    /** CommandPalette 等自适应容器高度平滑过渡 (180ms) */
    adaptiveHeight: { duration: 0.18, ease: motionEase.flip },
    /** 热力图单格显影 (180ms) */
    heatCell: { duration: 0.18, ease: motionEase.enter },
    heatColumnDelay: 0.012,
  },
  spatial: {
    /** Dialog 表面快速不透明化 (120ms) */
    dialogFade: { duration: 0.12, ease: 'linear' as const },
    /** Dialog 位移落位 (220ms) */
    dialogEnter: { duration: 0.22, ease: motionEase.enter },
    /** Dialog 退出 (160ms) */
    dialogExit: { duration: 0.16, ease: motionEase.exit },
    /** 页面内容切换、折叠区展开、侧栏开合 (200ms) */
    standard: { duration: 0.2, ease: motionEase.enter },
    /** Sheet 抽屉滑入 (280ms) */
    sheetEnter: { duration: 0.28, ease: motionEase.enter },
    /** Sheet 抽屉滑出 (180ms) */
    sheetExit: { duration: 0.18, ease: motionEase.exit },
    /** Channel 4: FloatingHud / 右侧检视栏内容切换 (240ms) */
    hud: { duration: 0.24, ease: motionEase.enter },
    /** 按钮形态切换与详情锚点过渡 (240ms) */
    morph: { duration: 0.24, ease: motionEase.enter },
    /** Channel 3: 单边界 FLIP 几何展开与邻位让位 (380ms) */
    flip: { duration: 0.38, ease: motionEase.flip },
    /** 阻尼弹簧表面过渡（无过冲） */
    springSurface: { type: 'spring' as const, stiffness: 280, damping: 26, mass: 0.8 },
    /** 阻尼弹簧布局让位 */
    springLayout: { type: 'spring' as const, stiffness: 260, damping: 28, mass: 0.9 },
  },
  causal: {
    /** 首屏概览卡入场，同一会话/授权周期仅触发一次 (320ms) */
    entrance: { duration: 0.32, ease: motionEase.enter },
    entranceScale: 1,
    /** 拓扑图 / 组织树首次生长 (360ms，总预算 <= 650ms) */
    growth: { duration: 0.36, ease: motionEase.enter },
    growthStagger: 0.06,
    growthBudget: 0.65,
    /** Channel 2: 一次性 SVG 路径脉冲，播完即卸载 (420ms，静止 rAF = 0) */
    pathPulse: { duration: 0.42, ease: motionEase.enter },
    /** Channel 5: 主视觉数字滚轮 (460ms，每页 <= 2 处) */
    odometer: { duration: 0.46, ease: motionEase.enter },
    odometerStagger: 0.03,
    /** 非焦点拓扑分支弱化透明度 */
    dimOpacity: 0.35,
    /** 动效关闭或零延迟静态落位 */
    instant: { duration: 0 },
  },
} as const

export const motionDuration = {
  feedback: unifiedMotion.tactile.feedback.duration,
  /** Dialog surfaces turn opaque this fast while their movement continues on `layer`. */
  fade: unifiedMotion.spatial.dialogFade.duration,
  popoverExit: unifiedMotion.tactile.popoverExit.duration,
  exit: unifiedMotion.spatial.dialogExit.duration,
  enter: unifiedMotion.tactile.popoverEnter.duration,
  layer: unifiedMotion.spatial.dialogEnter.duration,
  standard: unifiedMotion.spatial.standard.duration,
  panelExit: unifiedMotion.spatial.sheetExit.duration,
  panel: unifiedMotion.spatial.sheetEnter.duration,
  hud: unifiedMotion.spatial.hud.duration,
  flip: unifiedMotion.spatial.flip.duration,
} as const

/** motion/react 组件必须复用这些 transition，禁止在业务组件内另写 duration / ease。 */
export const motionTransition = {
  feedback: unifiedMotion.tactile.feedback,
  enter: unifiedMotion.tactile.popoverEnter,
  popoverExit: unifiedMotion.tactile.popoverExit,
  layerEnter: unifiedMotion.spatial.dialogEnter,
  exit: unifiedMotion.spatial.dialogExit,
  standard: unifiedMotion.spatial.standard,
  panelEnter: unifiedMotion.spatial.sheetEnter,
  panelExit: unifiedMotion.spatial.sheetExit,
  hud: unifiedMotion.spatial.hud,
  flip: unifiedMotion.spatial.flip,
} as const

/** Dashboard / authorization insights: finite, interruptible movement; derived from unifiedMotion. */
export const insightMotion = {
  surface: unifiedMotion.spatial.springSurface,
  layout: unifiedMotion.spatial.springLayout,
  chart: unifiedMotion.causal.odometer,
  number: unifiedMotion.causal.odometer,
  instant: unifiedMotion.causal.instant,
  stagger: 0.04,
  enterOffset: motionGeometry.enterOffset,
  hoverLift: motionGeometry.hoverLift,
} as const

/** Alias retained for compatibility; identical to insightMotion. */
export const studyMotion = insightMotion

/**
 * State-driven causal motion projection; derived directly from unifiedMotion with zero numeric fork.
 */
export const stateMotion = {
  morph: unifiedMotion.spatial.morph,
  entrance: unifiedMotion.causal.entrance,
  entranceScale: unifiedMotion.causal.entranceScale,
  odometer: unifiedMotion.causal.odometer,
  odometerStagger: unifiedMotion.causal.odometerStagger,
  growth: unifiedMotion.causal.growth,
  growthStagger: unifiedMotion.causal.growthStagger,
  growthBudget: unifiedMotion.causal.growthBudget,
  pathPulse: unifiedMotion.causal.pathPulse,
  heatColumnDelay: unifiedMotion.tactile.heatColumnDelay,
  heatCell: unifiedMotion.tactile.heatCell,
  yieldLayout: unifiedMotion.spatial.springLayout,
  dimOpacity: unifiedMotion.causal.dimOpacity,
} as const

/**
 * Multi-channel causal coupled motion envelope (240ms–500ms); derived directly from unifiedMotion.
 */
export const coupledMotion = {
  /** Channel 1: Origin anchor lock (150ms). */
  anchor: unifiedMotion.tactile.anchor,
  /** Channel 2: One-shot SVG path pulse (420ms, zero idle rAF). */
  pulse: unifiedMotion.causal.pathPulse,
  /** Channel 3: Single-boundary FLIP layout & neighbor yield (380ms). */
  flip: unifiedMotion.spatial.flip,
  /** Channel 4: Floating HUD & inspector content switch (240ms). */
  hud: unifiedMotion.spatial.hud,
  /** Channel 5: Hero odometer reel (460ms). */
  odometer: unifiedMotion.causal.odometer,
  /** Adaptive height breathing for CommandPalette [data-adaptive] (180ms). */
  adaptiveHeight: unifiedMotion.tactile.adaptiveHeight,
} as const
