import {
  NoToneMapping,
  CatmullRomCurve3,
  DoubleSide,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Renderer,
} from 'three/webgpu'
import { exp, materialOpacity, normalView, positionLocal, uniform, uv } from 'three/tsl'

import { SLIME_RECIPE, type SlimeColours } from './appearance'
import { frontSurfaceZ, restPoint, seededRandom } from './shape'

export interface SkinGeometry {
  geometry: BufferGeometry
  rest: Float32Array
}

export function createSlimeScene(renderer: Renderer, colours: SlimeColours) {
  const scene = new Scene()
  // Composite naturally onto the stage; no opaque canvas rectangle.
  scene.background = null
  renderer.setClearColor(0, 0)
  renderer.toneMapping = NoToneMapping
  renderer.toneMappingExposure = 1

  const half = SLIME_RECIPE.viewHeight / 2
  const camera = new OrthographicCamera(-half, half, half, -half, 0.1, 30)
  camera.position.set(0, 2.35, 9)
  camera.lookAt(0, 1.025, 0)

  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const skins: SkinGeometry[] = []
  const ownGeometry = <T extends BufferGeometry>(geometry: T): T => {
    geometries.push(geometry)
    return geometry
  }
  const ownMaterial = <T extends Material>(material: T): T => {
    materials.push(material)
    return material
  }
  const rememberSkin = (geometry: BufferGeometry) => {
    geometry.computeVertexNormals()
    skins.push({ geometry, rest: new Float32Array(geometry.getAttribute('position').array) })
    return geometry
  }

  // A tiny local studio: analytic white light cards, no network HDR/environment dependency.
  const studio = new Scene()
  studio.background = colours.environment
  const lightCards: { material: MeshBasicNodeMaterial; intensity: number }[] = []
  const addCard = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    intensity: number,
  ) => {
    const lightCardMaterial = ownMaterial(
      new MeshBasicNodeMaterial({
        color: colours.light.clone().multiplyScalar(intensity),
        side: DoubleSide,
      }),
    )
    const card = new Mesh(ownGeometry(new PlaneGeometry(width, height)), lightCardMaterial)
    lightCards.push({ material: lightCardMaterial, intensity })
    card.position.set(x, y, z)
    card.lookAt(0, 0, 0)
    studio.add(card)
  }
  addCard(-5, 7.5, 2.5, 5, 6.5, 6)
  addCard(6, 4, 0, 2, 6, 6)
  addCard(0, -3, -1, 6, 3, 2)
  const pmrem = new PMREMGenerator(renderer)
  let environment = pmrem.fromScene(studio, 0.025, 0.1, 30, { size: 256 })
  scene.environment = environment.texture
  const ambientLight = new HemisphereLight(colours.light, colours.attenuation, 0.3)
  scene.add(ambientLight)
  const keyLight = new DirectionalLight(colours.light, 1.4)
  keyLight.position.set(-3, 5, 4)
  scene.add(keyLight)

  const shadowMaterial = ownMaterial(
    new MeshBasicNodeMaterial({
      color: colours.shadow,
      transparent: true,
      depthWrite: false,
    }),
  )
  const shadowFade = uniform(1)
  shadowMaterial.opacityNode = exp(uv().sub(0.5).length().pow(2).mul(-20)).mul(0.55).mul(shadowFade)
  const shadow = new Mesh(ownGeometry(new PlaneGeometry(4.8, 4)), shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.018
  scene.add(shadow)

  const actor = new Group()
  scene.add(actor)
  const bodyGeometry = ownGeometry(
    new SphereGeometry(1, SLIME_RECIPE.widthSegments, SLIME_RECIPE.heightSegments),
  )
  const bodyPositions = bodyGeometry.getAttribute('position')
  for (let i = 0; i < bodyPositions.count; i++) {
    const point = restPoint(bodyPositions.getX(i), bodyPositions.getY(i), bodyPositions.getZ(i))
    bodyPositions.setXYZ(i, point.x, point.y, point.z)
  }
  const bodyMaterial = ownMaterial(
    new MeshPhysicalNodeMaterial({
      color: colours.body,
      roughness: SLIME_RECIPE.roughness,
      metalness: 0,
      transmission: SLIME_RECIPE.transmission,
      thickness: SLIME_RECIPE.thickness,
      ior: SLIME_RECIPE.ior,
      attenuationColor: colours.attenuation,
      attenuationDistance: SLIME_RECIPE.attenuationDistance,
      clearcoat: 1,
      clearcoatRoughness: 0.11,
      envMapIntensity: 0.9,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    }),
  )
  // A restrained scattering approximation: local bottom glow + grazing-angle soft rim.
  const rim = normalView.z.abs().oneMinus().pow(3)
  const rimColour = uniform(colours.light.clone())
  const glowColour = uniform(colours.glow.clone())
  bodyMaterial.emissiveNode = rimColour
    .mul(rim.mul(0.11).add(exp(positionLocal.y.mul(-5)).mul(0.14)))
    .add(glowColour)
  const body = new Mesh(rememberSkin(bodyGeometry), bodyMaterial)
  body.renderOrder = 2
  actor.add(body)

  // Face vertices are laid on the skin in the same coordinate space, ready for shared deformation.
  const faceMaterial = ownMaterial(
    new MeshPhysicalNodeMaterial({
      color: colours.face,
      transparent: true,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.5,
    }),
  )
  const eyeGeometries: BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const eyeGeometry = ownGeometry(new SphereGeometry(1, 24, 16))
    const positions = eyeGeometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const x = side * 0.42 + positions.getX(i) * 0.108
      const y = 0.98 + positions.getY(i) * 0.064
      const z = frontSurfaceZ(x, y) + positions.getZ(i) * 0.045 + 0.022
      positions.setXYZ(i, x, y, z)
    }
    eyeGeometries.push(eyeGeometry)
    const eye = new Mesh(rememberSkin(eyeGeometry), faceMaterial)
    eye.renderOrder = 3
    actor.add(eye)
  }
  const mouthCurve = new CatmullRomCurve3([
    new Vector3(-0.116, 0.89, 0),
    new Vector3(-0.073, 0.854, 0),
    new Vector3(0, 0.84, 0),
    new Vector3(0.073, 0.854, 0),
    new Vector3(0.116, 0.89, 0),
  ])
  const mouthGeometry = ownGeometry(new TubeGeometry(mouthCurve, 32, 0.01, 8, false))
  const mouthPositions = mouthGeometry.getAttribute('position')
  for (let i = 0; i < mouthPositions.count; i++) {
    const x = mouthPositions.getX(i)
    const y = mouthPositions.getY(i)
    mouthPositions.setZ(i, frontSurfaceZ(x, y) + mouthPositions.getZ(i) + 0.025)
  }
  const mouth = new Mesh(rememberSkin(mouthGeometry), faceMaterial)
  mouth.renderOrder = 3
  actor.add(mouth)

  const random = seededRandom(85)
  const bubbleGeometry = ownGeometry(new SphereGeometry(1, 12, 8))
  const bubbleMaterial = ownMaterial(
    new MeshPhysicalNodeMaterial({
      color: colours.light,
      roughness: 0.12,
      metalness: 0,
      envMapIntensity: 0.4,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  )
  // Thin air inclusions: almost clear centres and soft Fresnel edges, not metallic beads.
  bubbleMaterial.opacityNode = normalView.z
    .abs()
    .oneMinus()
    .pow(2)
    .mul(0.65)
    .add(0.07)
    .mul(materialOpacity)
  const bubbles: {
    mesh: Mesh
    material: MeshPhysicalNodeMaterial
    rest: Vector3
    radius: number
  }[] = []
  for (let i = 0; i < SLIME_RECIPE.bubbleCount; i++) {
    const y = 0.22 + random() * 1.36
    const x = (random() - 0.5) * 1.82 * Math.sin((y / 2) * Math.PI) ** 0.5
    const material = ownMaterial(bubbleMaterial.clone())
    const bubble = new Mesh(bubbleGeometry, material)
    const radius = 0.006 + random() ** 2 * 0.027
    bubble.scale.setScalar(radius)
    const z = frontSurfaceZ(x, y) * (-0.35 + random() * 1.08)
    bubble.position.set(x, y, z)
    bubble.renderOrder = 1
    actor.add(bubble)
    bubbles.push({ mesh: bubble, material, rest: bubble.position.clone(), radius })
  }

  return {
    scene,
    camera,
    actor,
    body,
    skins,
    eyeGeometries,
    mouthGeometry,
    bubbles,
    shadow,
    shadowFade,
    colours,
    updateColours(next: SlimeColours) {
      bodyMaterial.color.copy(next.body)
      bodyMaterial.attenuationColor.copy(next.attenuation)
      faceMaterial.color.copy(next.face)
      bubbleMaterial.color.copy(next.light)
      for (const bubble of bubbles) bubble.material.color.copy(next.light)
      shadowMaterial.color.copy(next.shadow)
      rimColour.value.copy(next.light)
      glowColour.value.copy(next.glow)
      ambientLight.color.copy(next.light)
      ambientLight.groundColor.copy(next.attenuation)
      keyLight.color.copy(next.light)
      studio.background = next.environment
      for (const card of lightCards)
        card.material.color.copy(next.light).multiplyScalar(card.intensity)
      const previous = environment
      environment = pmrem.fromScene(studio, 0.025, 0.1, 30, { size: 256 })
      scene.environment = environment.texture
      previous.dispose()
    },
    resize(width: number, height: number) {
      const aspect = width / Math.max(1, height)
      camera.left = -half * aspect
      camera.right = half * aspect
      camera.updateProjectionMatrix()
    },
    dispose() {
      environment.dispose()
      pmrem.dispose()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      scene.clear()
      studio.clear()
    },
  }
}

export type SlimeScene = ReturnType<typeof createSlimeScene>
