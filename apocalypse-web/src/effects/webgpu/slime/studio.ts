/** Adapted from yuanyang749/softie-webgpu, MIT, Copyright (c) 2026 yuanyang749.
 * Source: https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f
 * Changes: TypeScript, Apocalypse host/lifecycle integration. See public/licenses/softie-webgpu.txt.
 */
import {
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  type Renderer,
} from 'three/webgpu'
import { float, materialOpacity, uniform, uv } from 'three/tsl'
import type { SlimeColours } from './appearance'
import type { Point3 } from './shape'

/** Local baked cards; analytic equivalents of the source's three radial shadow textures. */
export function createStudio(renderer: Renderer, scene: Scene, colours: SlimeColours) {
  const studio = new Scene()
  studio.background = colours.environment
  const lightColour = uniform(colours.light.clone())
  const cards: Mesh<PlaneGeometry, MeshBasicNodeMaterial>[] = []
  const addCard = (x: number, y: number, z: number, w: number, h: number, strength: number) => {
    const material = new MeshBasicNodeMaterial()
    const q = uv().sub(0.5).mul(2).abs().pow(4)
    const feather = q.x.add(q.y).pow(0.25).smoothstep(0.7, 1).oneMinus()
    material.colorNode = lightColour.mul(float(0.8).add(feather.mul(strength)))
    const card = new Mesh(new PlaneGeometry(w, h), material)
    card.position.set(x, y, z)
    card.lookAt(0, 0, 0)
    studio.add(card)
    cards.push(card)
  }
  addCard(-4.5, 5, 3, 3.2, 5.5, 12)
  addCard(4.5, 3, 2, 1.6, 5, 9)
  addCard(-1, 1, -5, 3, 3, 1.2)
  addCard(-6, -0.5, -2, 1.5, 5, -0.45)
  addCard(6, -0.5, -2, 1.5, 5, -0.45)
  addCard(0, -4, 0, 9, 7, 0.7)
  const pmrem = new PMREMGenerator(renderer)
  let environment = pmrem.fromScene(studio, 0.015, 0.1, 40, { size: 512 })
  scene.environment = environment.texture
  scene.environmentIntensity = 0.9
  const key = new DirectionalLight(colours.light, 1.8)
  key.position.set(-4, 6, 6)
  const fill = new DirectionalLight(colours.light, 0.8)
  fill.position.set(4, 3, 1)
  const ambient = new HemisphereLight(colours.light, colours.environment, 1.1)
  scene.add(key, fill, ambient)

  const layer = (w: number, h: number, y: number, z: number, order: number) => {
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const radius = uv().sub(0.5).mul(2).length()
    material.opacityNode = radius.smoothstep(0, 1).oneMinus().pow(2).mul(materialOpacity)
    const mesh = new Mesh(new PlaneGeometry(w, h), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(0, y, z)
    mesh.renderOrder = order
    scene.add(mesh)
    return { mesh, material }
  }
  const shadow = layer(5.5, 3.5, 0.002, 0, -3)
  const projection = layer(4.5, 2.7, 0.005, 0.33, -2)
  const contact = layer(3.8, 2.3, 0.007, 0.32, -1)
  const setLayerColours = (c: SlimeColours) => {
    shadow.material.color.copy(c.shadow)
    projection.material.color.copy(c.body)
    contact.material.color.copy(c.shadow)
  }
  setLayerColours(colours)
  let disposed = false
  return {
    get environment() {
      return environment.texture
    },
    layers: [shadow, projection, contact],
    updateColours(c: SlimeColours) {
      studio.background = c.environment
      lightColour.value.copy(c.light)
      key.color.copy(c.light)
      fill.color.copy(c.light)
      ambient.color.copy(c.light)
      ambient.groundColor.copy(c.environment)
      const next = pmrem.fromScene(studio, 0.015, 0.1, 40, { size: 512 })
      const previous = environment
      environment = next
      scene.environment = next.texture
      previous.dispose()
      setLayerColours(c)
    },
    update(p: Point3) {
      shadow.mesh.position.set(p.x, 0.002, p.z)
      shadow.mesh.scale.setScalar(1 + p.y * 0.16)
      shadow.material.opacity = 0.22 * Math.max(0.14, 1 - p.y * 0.24)
      projection.mesh.position.set(p.x, 0.005, p.z + 0.33)
      projection.mesh.scale.setScalar(1 + p.y * 0.12)
      projection.material.opacity = 0.48 * 0.95 * Math.exp(-p.y * 4.5)
      contact.mesh.position.set(p.x, 0.007, p.z + 0.32)
      contact.material.opacity = 0.36 * 0.85 * Math.exp(-p.y * 5)
    },
    dispose() {
      if (disposed) return
      disposed = true
      environment.dispose()
      pmrem.dispose()
      for (const card of cards) {
        card.geometry.dispose()
        card.material.dispose()
      }
      for (const item of [shadow, projection, contact]) {
        item.mesh.geometry.dispose()
        item.material.dispose()
      }
    },
  }
}
