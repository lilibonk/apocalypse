/** Isolated manual acceptance document. Not an application route or auth bypass. */
import '@/index.css'
import './preview.css'
import './slime.css'

import type { OrbState } from '@/effects/PixelOrb/types'

import { createSlimeRuntime, type SlimeRuntime } from './runtime'

const root = document.getElementById('root')!
let runtime: SlimeRuntime | undefined
let state: OrbState = 'idle'
const caption = document.createElement('p')
caption.textContent = 'Apocalypse · 目标图对齐 / WebGPU 初始化中'
root.append(caption)
const comparison = document.createElement('div')
comparison.className = 'slime-comparison'
root.append(comparison)
const reference = document.createElement('img')
reference.src = new URL('../../../../docs/brand-slime/target-v1.png', import.meta.url).href
reference.alt = '目标效果图'
reference.className = 'slime-preview-canvas'
comparison.append(reference)
const canvas = document.createElement('canvas')
const stage = document.createElement('div')
stage.className = 'brand-slime-stage slime-preview-stage'
comparison.append(stage)
canvas.setAttribute('aria-label', '互动青绿史莱姆：按住揉捏、拖动拎起、松手回弹，空格或回车戳一下')
canvas.setAttribute('role', 'button')
canvas.tabIndex = 0
canvas.className = 'slime-preview-canvas'
stage.append(canvas)

const controls = document.createElement('div')
controls.className = 'slime-preview-controls'
root.append(controls)
const addButton = (label: string, action: () => void) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', action)
  controls.append(button)
  return button
}
addButton('静态对齐', () => runtime?.setStatic(true))
addButton('开始交互', () => runtime?.setStatic(false))
addButton('戳一下', () => {
  runtime?.setStatic(false)
  runtime?.poke()
})
addButton('保持按压', () => {
  runtime?.setStatic(false)
  runtime?.holdPressure(true)
})
addButton('松手', () => runtime?.holdPressure(false))
addButton('亮色', () => document.documentElement.classList.remove('dark'))
addButton('暗色', () => document.documentElement.classList.add('dark'))
const states: OrbState[] = ['idle', 'waiting', 'success', 'error', 'sleeping']
for (const value of states)
  addButton(value, () => {
    state = value
    runtime?.setState(value)
  })
addButton('60 秒性能验证（预热 10 秒）', () => runtime?.startBenchmark())
addButton('模拟设备丢失', () => runtime?.simulateDeviceLoss())
const exportLink = document.createElement('a')
exportLink.textContent = '海报尚未导出'
exportLink.setAttribute('aria-label', '静态海报 PNG')
addButton('导出透明海报', () => {
  if (!runtime) return
  runtime.setStatic(true)
  exportLink.href = runtime.exportPoster()
  exportLink.download = `mint-slime-${state}.png`
  exportLink.textContent = `下载 ${state} 透明海报`
})
controls.append(exportLink)
const videoLink = document.createElement('a')
videoLink.textContent = '录屏尚未导出'
videoLink.setAttribute('aria-label', '交互录屏 WebM')
const addRecording = (label: string, exercise: boolean) => {
  const recordButton = addButton(label, () => {
    if (!runtime || !window.MediaRecorder) return
    recordButton.disabled = true
    recordButton.textContent = '正在录制…'
    const stream = canvas.captureStream(60)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', (event) => chunks.push(event.data))
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach((track) => track.stop())
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        videoLink.href = String(reader.result)
        videoLink.download = 'mint-slime-interaction.webm'
        videoLink.textContent = '下载 12 秒交互录屏'
        recordButton.disabled = false
        recordButton.textContent = label
      })
      reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }))
    })
    if (exercise) runtime.startBenchmark()
    else {
      runtime.setStatic(true)
      runtime.setState('idle')
      runtime.setStatic(false)
    }
    recorder.start()
    window.setTimeout(() => recorder.stop(), 12000)
  })
}
addRecording('录制 12 秒交互', true)
addRecording('录制 12 秒气泡', false)
controls.append(videoLink)
const checks = document.createElement('div')
root.append(checks)
const checksButton = addButton('打开真实组件检查', () => {
  runtime?.setStatic(true)
  checksButton.disabled = true
  void import('./mount-checks').then(({ mountSlimeChecks }) => mountSlimeChecks(checks))
})
const diagnostics = document.createElement('pre')
diagnostics.setAttribute('aria-label', 'WebGPU 性能与物理状态')
root.append(diagnostics)

const controller = new AbortController()
window.addEventListener('pagehide', () => controller.abort(), { once: true })
try {
  runtime = await createSlimeRuntime(canvas, {
    signal: controller.signal,
    gaze: true,
    onReady(info) {
      caption.textContent = `WebGPU · Three.js r185 · ${info.adapter} · ${info.width}×${info.height} · DPR ${info.dpr}`
    },
    onFailure(reason) {
      caption.textContent = `WebGPU 未启动或已关闭（${reason}）。无 WebGL 回退。请重新载入再试。`
    },
    onFrame(report, physics, ambient) {
      diagnostics.textContent = JSON.stringify(
        {
          live: report,
          workload: {
            pixelWave: false,
            stageCssWidth: canvas.clientWidth,
            stageCssHeight: canvas.clientHeight,
          },
          ambient,
          physics: {
            pressed: physics.pressed,
            dragged: physics.dragged,
            height: physics.y,
            dent: physics.dent,
            impacts: physics.impacts,
          },
          benchmark: runtime?.getBenchmark(),
        },
        null,
        2,
      )
    },
  })
  runtime.setStatic(true)
} catch (error) {
  diagnostics.textContent = error instanceof Error ? error.message : 'WebGPU 初始化异常'
}
