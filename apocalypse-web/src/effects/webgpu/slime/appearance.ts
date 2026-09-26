/** LIL-85 material recipe. All visible colours come from the design tokens. */
import { Color } from 'three/webgpu'

export const SLIME_RECIPE = {
  widthSegments: 96,
  heightSegments: 64,
  bubbleCount: 116,
  maxPixelRatio: 2,
  viewHeight: 4.35,
  roughness: 0.48,
  transmission: 0.04,
  thickness: 1.4,
  ior: 1.34,
  attenuationDistance: 2.4,
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
    cream: colour('cream'),
    blush: colour('blush'),
    skinTint: colour('skin-tint'),
    attenuation: colour('attenuation'),
    face: colour('face'),
    light: colour('light'),
    shadow: colour('shadow'),
    environment: colour('environment'),
    glow: colour('glow'),
    star: colour('star'),
    starGlow: colour('star-glow'),
  }
}

export type SlimeColours = ReturnType<typeof readSlimeColours>
