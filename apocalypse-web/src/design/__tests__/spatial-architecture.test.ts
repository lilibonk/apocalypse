import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  coupledMotion,
  insightMotion,
  motionDuration,
  motionTransition,
  stateMotion,
  unifiedMotion,
} from '../motion'

/**
 * Static architecture enforcement for the spatial shell / coupled-motion foundation.
 * S1 retired modules never re-enter, S2 one motion engine and one preference source,
 * S3 HUD / sticky rails never stretch, S4 odometer reels stay reserved for hero metrics,
 * S7 unified radius/ink-well tokens & single-source motion, S8 @container main & LivingContextBar.
 */
const SRC = fileURLToPath(new URL('../../', import.meta.url))
const SELF = fileURLToPath(import.meta.url)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const files = walk(SRC).filter((file) => /\.(ts|tsx|css)$/.test(file) && file !== SELF)
const rel = (file: string) => relative(SRC, file).split(sep).join('/')
const read = (file: string) => readFileSync(file, 'utf8')

function stripCssComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function cssBlock(css: string, selector: string): string {
  const clean = stripCssComments(css)
  const blocks: string[] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  for (const [, head, body] of clean.matchAll(pattern)) {
    if (head.split(',').some((part) => part.trim() === selector)) blocks.push(body)
  }
  return blocks.join('\n')
}

describe('S1 retired modules never re-enter', () => {
  const retired = [
    'ObjectWorkspacePanels',
    'InsightStrip',
    'workspace-context',
    'role-member-context',
    'useRolePanelWidth',
    'PixelScale',
    'PixelBubble',
  ]

  it.each(retired)('has zero references to %s', (name) => {
    const hits = files.filter((file) => read(file).includes(name)).map(rel)
    expect(hits).toEqual([])
  })

  it('keeps no temporary --study-* design variables', () => {
    expect(read(join(SRC, 'design/tokens.css'))).not.toMatch(/--study-/)
  })
})

describe('S2 single motion engine and unified preference', () => {
  it('only useMotionPreference reads the raw reduced-motion hook', () => {
    const hits = files
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => rel(file) !== 'hooks/useMotionPreference.ts')
      .filter((file) => /useReducedMotion\s*\(/.test(read(file)))
      .map(rel)
    expect(hits).toEqual([])
  })

  it('never imports a second animation engine', () => {
    const hits = files
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => /from\s+['"](animejs|gsap)['"]/.test(read(file)))
      .map(rel)
    expect(hits).toEqual([])
  })
})

describe('S3 HUD and sticky rails never stretch', () => {
  const css = read(join(SRC, 'design/spatial.css'))

  it.each(['.floating-hud', '.sticky-compact-rail', '.sticky-rail-inspector'])(
    '%s is fit-content with its own scroll',
    (selector) => {
      const body = cssBlock(css, selector)
      expect(body).toMatch(/height:\s*fit-content/)
      expect(body).toMatch(/overflow-y:\s*auto/)
    },
  )

  it.each(['.sticky-rail-layout', '.flip-expand-grid'])('%s aligns items to start', (selector) => {
    expect(cssBlock(css, selector)).toMatch(/align-items:\s*start/)
  })
})

describe('S4 odometer restraint', () => {
  it('allows at most two hero-odometer metrics per view file', () => {
    const offenders = files
      .filter((file) => rel(file).startsWith('views/') && file.endsWith('.tsx'))
      .map((file) => ({
        file: rel(file),
        count: (read(file).match(/variant=["']hero-odometer["']/g) ?? []).length,
      }))
      .filter(({ count }) => count > 2)
    expect(offenders).toEqual([])
  })
})

describe('S5 top-anchored LivingContextBar and zero inline table EntityPill', () => {
  const viewFiles = files.filter(
    (file) => rel(file).startsWith('views/') && /\.(ts|tsx)$/.test(file),
  )

  it('never renders EntityPill inside a table cell or DynaColumn render callback', () => {
    const tdOffenders = viewFiles
      .filter((file) => /<td[\s\S]*?<EntityPill[\s\S]*?<\/td>/.test(read(file)))
      .map(rel)
    expect(tdOffenders).toEqual([])

    const renderOffenders = viewFiles
      .filter((file) => /render\s*:\s*\([^)]*\)\s*=>\s*<EntityPill/.test(read(file)))
      .map(rel)
    expect(renderOffenders).toEqual([])
  })

  it('requires every view file using EntityPill (except command-palette AuthorizationQuestions) to mount LivingContextBar', () => {
    const exempt = new Set(['views/system/role/AuthorizationQuestions.tsx'])
    const offenders = viewFiles
      .filter((file) => !exempt.has(rel(file)))
      .filter((file) => {
        const content = read(file)
        return content.includes('<EntityPill') && !content.includes('<LivingContextBar')
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('S6 single primary lens per screen (LoginLog overview vs list)', () => {
  it('mounts DynaTable only in the list branch of views/system/log/login/index.tsx, never in overview', () => {
    const loginLogSource = read(join(SRC, 'views/system/log/login/index.tsx'))
    const splitIndex = loginLogSource.indexOf("view === 'overview'")
    expect(splitIndex).toBeGreaterThan(-1)

    const afterOverviewCheck = loginLogSource.slice(splitIndex)
    const elseBranchIndex = afterOverviewCheck.indexOf(') : (')
    expect(elseBranchIndex).toBeGreaterThan(-1)

    const overviewBranch = afterOverviewCheck.slice(0, elseBranchIndex)
    const listBranch = afterOverviewCheck.slice(elseBranchIndex)

    expect(overviewBranch).not.toContain('<DynaTable')
    expect(overviewBranch).not.toContain('<DynaSearch')
    expect(listBranch).toContain('<DynaTable')
  })
})

describe('S7 unified radius, ink-well tokens, and single-source unifiedMotion', () => {
  const tokensCss = read(join(SRC, 'design/tokens.css'))

  it('defines 3-tier radius tokens and eliminates the 1.5rem card radius fork', () => {
    const rootBlock = cssBlock(tokensCss, ':root')
    expect(rootBlock).toMatch(/--radius-control:\s*0\.625rem/)
    expect(rootBlock).toMatch(/--radius-panel:\s*1rem/)
    expect(rootBlock).toMatch(/--radius-stage:\s*1\.25rem/)
    expect(rootBlock).toMatch(/--insight-card-radius:\s*var\(--radius-panel\)/)
    expect(rootBlock).not.toMatch(/--insight-card-radius:\s*1\.5rem/)
  })

  it('defines --ink-well and --ink-well-foreground in both :root and .dark', () => {
    const rootBlock = cssBlock(tokensCss, ':root')
    const darkBlock = cssBlock(tokensCss, '.dark')
    expect(rootBlock).toMatch(/--ink-well:\s*oklch\(/)
    expect(rootBlock).toMatch(/--ink-well-foreground:\s*oklch\(/)
    expect(darkBlock).toMatch(/--ink-well:\s*oklch\(/)
    expect(darkBlock).toMatch(/--ink-well-foreground:\s*oklch\(/)
  })

  it('derives all motion namespaces from unifiedMotion with zero numeric divergence', () => {
    expect(stateMotion.odometer).toBe(unifiedMotion.causal.odometer)
    expect(coupledMotion.odometer).toBe(unifiedMotion.causal.odometer)
    expect(stateMotion.pathPulse).toBe(unifiedMotion.causal.pathPulse)
    expect(coupledMotion.pulse).toBe(unifiedMotion.causal.pathPulse)
    expect(insightMotion.surface).toBe(unifiedMotion.spatial.springSurface)
    expect(insightMotion.layout).toBe(unifiedMotion.spatial.springLayout)
    expect(stateMotion.yieldLayout).toBe(unifiedMotion.spatial.springLayout)
    expect(motionDuration.hud).toBe(unifiedMotion.spatial.hud.duration)
    expect(motionTransition.flip).toBe(unifiedMotion.spatial.flip)

    const rootBlock = cssBlock(tokensCss, ':root')
    expect(rootBlock).toMatch(/--motion-duration-odometer:\s*460ms/)
    expect(rootBlock).toMatch(/--motion-duration-path-pulse:\s*420ms/)
    expect(rootBlock).toMatch(/--motion-duration-flip:\s*380ms/)
  })
})

describe('S8 container-query responsiveness and LivingContextBar primitive', () => {
  const spatialCss = read(join(SRC, 'design/spatial.css'))
  const navIndex = read(join(SRC, 'components/navigation/index.ts'))

  it('declares .spatial-main-container with container-name: main', () => {
    const block = cssBlock(spatialCss, '.spatial-main-container')
    expect(block).toMatch(/container-type:\s*inline-size/)
    expect(block).toMatch(/container-name:\s*main/)
    expect(spatialCss).toMatch(/@container\s+main/)
  })

  it('exports LivingContextBar from components/navigation', () => {
    expect(navIndex).toContain('LivingContextBar')
    expect(spatialCss).toMatch(/\.living-context-bar/)
  })
})
