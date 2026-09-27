import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { motionDuration, motionTransition } from '../src/design/motion'

const tokensCss = readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8')
const dynaForm = readFileSync(
  new URL('../src/components/dyna/DynaForm.tsx', import.meta.url),
  'utf8',
)
const layerComponents = ['dialog.tsx', 'alert-dialog.tsx', 'sheet.tsx'].map((file) =>
  readFileSync(new URL(`../src/components/ui/${file}`, import.meta.url), 'utf8'),
)
const focusReturn = readFileSync(
  new URL('../src/components/ui/layer-focus-return.ts', import.meta.url),
  'utf8',
)

function tsxFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFilesUnder(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const allTsxSource = tsxFilesUnder(sourceRoot)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

/** Contract checks complement the browser focus/Escape and mid-animation visibility checks. */
describe('application surface motion contract', () => {
  it('keeps CSS and Motion on the same short, whole-surface durations', () => {
    const expected = {
      feedback: 120,
      exit: 160,
      enter: 180,
      layer: 220,
      standard: 200,
      panelExit: 180,
      panel: 280,
    } as const
    for (const [name, milliseconds] of Object.entries(expected)) {
      const key = name as keyof typeof expected
      const cssName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      expect(motionDuration[key] * 1000).toBeCloseTo(milliseconds)
      expect(tokensCss).toContain(`--motion-duration-${cssName}: ${milliseconds}ms`)
    }
    expect(motionTransition.layerEnter.duration).toBe(motionDuration.layer)
    expect(motionTransition.panelEnter.duration).toBe(motionDuration.panel)
    expect(motionDuration.exit).toBeLessThan(motionDuration.layer)
  })

  it('animates each complete surface while content has no reveal gate or separate delay', () => {
    for (const component of layerComponents) {
      expect(component).toContain('data-motion-preset="surface"')
      expect(component).not.toContain('PixelDialogMotion')
      expect(component).not.toContain('data-pixel-dialog-stage')
      expect(component).not.toContain('onAnimationEnd')
      expect(component).not.toContain('useAnimate')
    }
    expect(tokensCss).toContain('@keyframes surface-dialog-enter')
    expect(tokensCss).toContain('@keyframes surface-sheet-enter-right')
    expect(tokensCss).toContain('@keyframes surface-float-enter')
    expect(tokensCss).toContain(
      'animation: surface-dialog-enter var(--motion-duration-layer) var(--motion-ease-enter) both',
    )
    expect(tokensCss).not.toContain('clip-path:')
    expect(tokensCss).not.toContain('data-pixel-dialog-stage')
    expect(tokensCss).not.toContain('--motion-duration-dialog-reveal')
    expect(tokensCss).not.toContain('--motion-dialog-header-at')
    expect(tokensCss).not.toContain('@keyframes pixel-float-enter')
  })

  it('makes every open layer immediately readable for both motion switches', () => {
    const reduced = tokensCss.slice(tokensCss.indexOf('@media (prefers-reduced-motion: reduce)'))
    const disabled = tokensCss.slice(tokensCss.indexOf("html[data-motion='off'] *"))
    for (const rules of [reduced, disabled]) {
      expect(rules).toContain("[data-motion-preset='surface'][data-state='open']")
      expect(rules).toContain('animation: none !important')
      expect(rules).toContain('opacity: 1 !important')
      expect(rules).toContain('transform: none !important')
      expect(rules).toContain("[data-slot='sheet-content'][data-state='open']")
      expect(rules).toContain('translate: 0 0 !important')
      expect(rules).toContain("[data-appearance='scale'] [data-slot='pixel-scale-bar']")
    }
  })

  it('preserves Radix focus wiring, titles, close controls and edit-form focus policy', () => {
    for (const component of layerComponents) {
      expect(component).toContain('useLayerFocusReturn(')
      expect(component).toContain('onOpenAutoFocus={handleOpenAutoFocus}')
      expect(component).toContain('onCloseAutoFocus={handleCloseAutoFocus}')
      expect(component).toContain('Primitive.Title')
    }
    expect(layerComponents[0]).toContain('<DialogPrimitive.Close')
    expect(layerComponents[1]).toContain('<AlertDialogPrimitive.Cancel')
    expect(layerComponents[2]).toContain('<SheetPrimitive.Close')
    expect(focusReturn).toContain('if (event.defaultPrevented) return')
    expect(focusReturn).toContain('if (!canRestoreFocus(returnTarget)) return')
    expect(focusReturn).toContain('returnTarget.focus({ preventScroll: true })')
    expect(dynaForm).toContain("if (mode !== 'edit') return")
    expect(dynaForm).toContain('event.preventDefault()')
    expect(dynaForm).toContain('dialogRef.current?.focus({ preventScroll: true })')
    expect(dynaForm).toContain('onOpenAutoFocus={handleOpenAutoFocus}')
  })

  it('removes the old reveal engine rather than retaining an alternate motion path', () => {
    for (const legacy of ['PixelDialogMotion', 'PixelSurfaceReveal', 'MotionSequence']) {
      expect(
        existsSync(
          fileURLToPath(new URL(`../src/components/motion/${legacy}.tsx`, import.meta.url)),
        ),
      ).toBe(false)
      expect(allTsxSource).not.toContain(`<${legacy}`)
    }
    expect(allTsxSource).not.toContain('data-pixel-dialog-stage')
    expect(allTsxSource).not.toContain('motionPreset=')
  })
})
