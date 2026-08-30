import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  dialogMotionSequence,
  dialogPixelWaveClipPaths,
  motionDuration,
} from '../src/design/motion'

const tokensCss = readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8')
const pixelDialogMotion = readFileSync(
  new URL('../src/components/motion/PixelDialogMotion.tsx', import.meta.url),
  'utf8',
)
const menuFormDialog = readFileSync(
  new URL('../src/views/system/menu/MenuFormDialog.tsx', import.meta.url),
  'utf8',
)
const dynaForm = readFileSync(
  new URL('../src/components/dyna/DynaForm.tsx', import.meta.url),
  'utf8',
)
const deptFormDialog = readFileSync(
  new URL('../src/views/system/dept/DeptFormDialog.tsx', import.meta.url),
  'utf8',
)
const layerComponents = ['dialog.tsx', 'alert-dialog.tsx', 'sheet.tsx'].map((file) =>
  readFileSync(new URL(`../src/components/ui/${file}`, import.meta.url), 'utf8'),
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

describe('pixel motion contract', () => {
  it('keeps the full three-stage reveal visible while exits remain fast', () => {
    expect(dialogMotionSequence.headerAt).toBe(0.1)
    expect(dialogMotionSequence.bodyAt).toBe(0.15)
    expect(dialogMotionSequence.footerAt).toBe(0.22)
    expect(dialogMotionSequence.footerAt + motionDuration.dialogReveal).toBeLessThanOrEqual(0.75)
    expect(motionDuration.dialogReveal).toBe(0.5)
    expect(motionDuration.exit).toBeLessThan(motionDuration.layer)
    expect(tokensCss).toContain('--motion-duration-dialog-reveal: 500ms')
    expect(tokensCss).toContain('--motion-ease-reveal: linear')
  })

  it('keeps only the current layer and floating-surface animation names', () => {
    expect(tokensCss).toContain('@keyframes pixel-sheet-enter-right')
    expect(tokensCss).toContain('@keyframes pixel-float-enter')
    expect(tokensCss).toContain("[data-slot='sheet-content'][data-side='right'][data-state='open']")
    expect(tokensCss).toContain("[data-slot='select-content'][data-state='open']")
    expect(tokensCss).not.toContain('@keyframes pixel-layer-enter')
    expect(tokensCss).not.toContain('pixel-relay')
    expect(tokensCss).not.toContain('pixel-surface-reveal')
  })

  it('routes Dialog, AlertDialog, and Sheet through PixelDialogMotion by construction', () => {
    for (const component of layerComponents) {
      expect(component).toContain('<PixelDialogMotion')
      expect(component).toContain('data-motion-preset="orchestrated"')
      expect(component).not.toContain('PixelSurfaceReveal')
    }
    expect(layerComponents[2]).toContain('<PixelDialogMotion animateSurface={false}>')
    expect(pixelDialogMotion).toContain("const STAGE_ATTRIBUTE = 'data-pixel-dialog-stage'")
    expect(pixelDialogMotion).toContain("element.setAttribute(STAGE_ATTRIBUTE, 'body')")
    expect(pixelDialogMotion).toContain('clipPath: dialogPixelWaveClipPaths')
    expect(tokensCss).toContain('[data-pixel-dialog-stage]')
    expect(tokensCss).toContain('clip-path: polygon(')
  })

  it('uses one fixed irregular wave for explicit and automatic content stages', () => {
    expect(dialogPixelWaveClipPaths).toHaveLength(5)
    expect(dialogPixelWaveClipPaths.every((frame) => frame.startsWith('polygon('))).toBe(true)
    expect(new Set(dialogPixelWaveClipPaths.map((frame) => frame.split(',').length)).size).toBe(1)
    expect(dialogPixelWaveClipPaths[0]).not.toBe(dialogPixelWaveClipPaths[1])
    expect(dialogPixelWaveClipPaths.at(-1)).toContain('100%')

    for (const crudForm of [menuFormDialog, dynaForm, deptFormDialog]) {
      expect(crudForm).toContain('<DialogContent')
      expect(crudForm).toContain('data-pixel-dialog-stage="header"')
      expect(crudForm).toContain('data-pixel-dialog-stage="body"')
      expect(crudForm).toContain('data-pixel-dialog-stage="footer"')
    }
  })

  it('keeps edit-form focus on the dialog instead of selecting the first populated input', () => {
    expect(dynaForm).toContain("if (mode !== 'edit') return")
    expect(dynaForm).toContain('event.preventDefault()')
    expect(dynaForm).toContain('dialogRef.current?.focus({ preventScroll: true })')
    expect(dynaForm).toContain('onOpenAutoFocus={handleOpenAutoFocus}')
  })

  it('deletes every legacy reveal path instead of leaving a fallback', () => {
    expect(
      existsSync(
        fileURLToPath(new URL('../src/components/motion/PixelSurfaceReveal.tsx', import.meta.url)),
      ),
    ).toBe(false)
    expect(
      existsSync(
        fileURLToPath(new URL('../src/components/motion/MotionSequence.tsx', import.meta.url)),
      ),
    ).toBe(false)
    expect(allTsxSource).not.toContain('PixelSurfaceReveal')
    expect(allTsxSource).not.toContain('<MotionSequence')
    expect(allTsxSource).not.toContain('motionPreset=')
    expect(tokensCss).not.toContain('--motion-duration-surface-reveal')
    expect(tokensCss).not.toContain('--motion-duration-relay-segment')
    expect(tokensCss).toContain("html[data-motion='off']")
  })
})
