/**
 * CRUD Dialog 的单时间轴装配器。
 *
 * 以 Radix Dialog 继续承担焦点与可访问性，本组件只用 Motion 编排遮罩、外壳、
 * 标题、正文与操作区。像素语言直接作用于真实内容：固定的不规则阶梯波前依次
 * 揭开三段信息，结束后不留下边线、端点或其它装饰 DOM。
 */

import { useAnimate } from 'motion/react'
import { useLayoutEffect, type ReactNode } from 'react'

import {
  dialogMotionSequence,
  dialogPixelWaveClipPaths,
  motionDuration,
  motionEase,
  motionGeometry,
} from '@/design/motion'
import { useMotionPolicy } from '@/hooks/useMotionPolicy'

const STAGE_ATTRIBUTE = 'data-pixel-dialog-stage'

export function PixelDialogMotion({
  children,
  animateSurface = true,
}: {
  children: ReactNode
  animateSurface?: boolean
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const { motionActive } = useMotionPolicy()

  useLayoutEffect(() => {
    const surface = scope.current?.parentElement
    const overlay = surface?.previousElementSibling

    if (!scope.current || !surface) return
    if (!motionActive) return

    const autoStages = Array.from(scope.current.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        !element.hasAttribute(STAGE_ATTRIBUTE) &&
        !element.querySelector(`[${STAGE_ATTRIBUTE}]`),
    )
    for (const element of autoStages) {
      element.setAttribute(STAGE_ATTRIBUTE, 'body')
      element.dataset.pixelDialogAutoStage = 'true'
    }

    const stageFrames = { opacity: [0, 1, 1, 1, 1], clipPath: dialogPixelWaveClipPaths }
    const stageTiming = {
      duration: motionDuration.dialogReveal,
      ease: motionEase.reveal,
      times: [0, 0.2, 0.5, 0.78, 1],
    }

    const controls =
      animateSurface && overlay instanceof HTMLElement
        ? animate([
            [
              overlay,
              { opacity: [0, 1] },
              {
                at: dialogMotionSequence.overlayAt,
                duration: motionDuration.layer,
                ease: motionEase.enter,
              },
            ],
            [
              surface,
              {
                opacity: [0, 1],
                scale: [motionGeometry.dialogScale, motionGeometry.dialogOvershoot, 1],
                y: [motionGeometry.dialogContentOffset, 0],
              },
              {
                at: dialogMotionSequence.surfaceAt,
                duration: motionDuration.panel,
                ease: motionEase.enter,
                times: [0, 0.68, 1],
              },
            ],
            [
              "[data-pixel-dialog-stage='header']",
              stageFrames,
              { ...stageTiming, at: dialogMotionSequence.headerAt },
            ],
            [
              "[data-pixel-dialog-stage='body']",
              stageFrames,
              { ...stageTiming, at: dialogMotionSequence.bodyAt },
            ],
            [
              "[data-pixel-dialog-stage='footer']",
              stageFrames,
              { ...stageTiming, at: dialogMotionSequence.footerAt },
            ],
          ])
        : animate([
            [
              "[data-pixel-dialog-stage='header']",
              stageFrames,
              { ...stageTiming, at: dialogMotionSequence.headerAt },
            ],
            [
              "[data-pixel-dialog-stage='body']",
              stageFrames,
              { ...stageTiming, at: dialogMotionSequence.bodyAt },
            ],
            [
              "[data-pixel-dialog-stage='footer']",
              stageFrames,
              { ...stageTiming, at: dialogMotionSequence.footerAt },
            ],
          ])

    return () => {
      controls.stop()
      for (const element of autoStages) {
        element.removeAttribute(STAGE_ATTRIBUTE)
        delete element.dataset.pixelDialogAutoStage
      }
    }
  }, [animate, animateSurface, motionActive, scope])

  return (
    <div ref={scope} data-slot="pixel-dialog-motion" className="contents">
      {children}
    </div>
  )
}
