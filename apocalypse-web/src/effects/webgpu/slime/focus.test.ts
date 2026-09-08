/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import login from '@/views/login/index.tsx?raw'

import { trackFocusOrigin } from './focus'

const css = readFileSync(new URL('./slime.css', import.meta.url), 'utf8')

const keyboardEvent = (key: string) => Object.assign(new Event('keydown'), { key })

describe('人工验收回归：指针不显示键盘焦点框', () => {
  it('Tab → 指针按压 → Tab 能正确切换来源，修复只删 outline 的不可访问做法', () => {
    const canvas = Object.assign(new EventTarget(), { dataset: {} as DOMStringMap }) as HTMLElement
    const keyboard = new EventTarget()
    const cleanup = trackFocusOrigin(canvas, keyboard)
    keyboard.dispatchEvent(keyboardEvent('Tab'))
    expect(canvas.dataset.focusOrigin).toBe('keyboard')
    canvas.dispatchEvent(new Event('pointerdown'))
    expect(canvas.dataset.focusOrigin).toBe('pointer')
    keyboard.dispatchEvent(keyboardEvent('Shift'))
    expect(canvas.dataset.focusOrigin).toBe('pointer')
    keyboard.dispatchEvent(keyboardEvent('Tab'))
    expect(canvas.dataset.focusOrigin).toBe('keyboard')
    cleanup()
    canvas.dispatchEvent(new Event('pointerdown'))
    keyboard.dispatchEvent(keyboardEvent('Enter'))
    expect(canvas.dataset.focusOrigin).toBeUndefined()
  })
  it('真实样式保留键盘 focus-visible，并排除 pointer 来源', () => {
    expect(css).toContain(":focus-visible:not([data-focus-origin='pointer'])")
    expect(css).toMatch(/outline:.*solid var\(--ring\)/)
    expect(css).toContain('user-select: none')
  })
  it('登录桌面/移动保留 gaze，但都不能挂载 PixelWave', () => {
    expect(login).not.toMatch(/<PixelWave[\s>]/)
    expect(login).toMatch(/<PixelOrb[^>]*size=\{384\} gaze/)
    expect(login).toMatch(/<PixelOrb[^>]*size=\{256\} gaze/)
  })
})
