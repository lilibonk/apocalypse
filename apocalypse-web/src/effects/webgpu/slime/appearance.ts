/** LIL-85 material recipe. All visible colours come from the design tokens. */
import { Color } from 'three/webgpu'

export const SLIME_RECIPE = {
  widthSegments: 64,
  heightSegments: 48,
  bubbleCount: 56,
  maxPixelRatio: 2,
  viewHeight: 3.32,
  roughness: 0.1,
  transmission: 0.7,
  thickness: 0.06,
  ior: 1.3,
  attenuationDistance: 2.6,
} as const

export function readSlimeColours(element: Element) {
  const style = getComputedStyle(element)
  const colour = (name: string) => {
    const value = style.getPropertyValue(`--slime-${name}`).trim()
    if (!value) throw new Error(`Missing slime design token: ${name}`)
    return new Color(value)
  }
  return {
    stage: colour('stage'),
    body: colour('body'),
    attenuation: colour('attenuation'),
    face: colour('face'),
    light: colour('light'),
    shadow: colour('shadow'),
    environment: colour('environment'),
    glow: colour('glow'),
  }
}

export type SlimeColours = ReturnType<typeof readSlimeColours>
