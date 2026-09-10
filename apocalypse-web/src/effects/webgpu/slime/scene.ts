/** Adapted from yuanyang749/softie-webgpu, MIT, Copyright (c) 2026 yuanyang749.
 * Source: https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f
 * Changes: TypeScript, Apocalypse host/lifecycle integration. See public/licenses/softie-webgpu.txt.
 */
import {
  DynamicDrawUsage,
  SphereGeometry,
  Vector3,
  TubeGeometry,
  CatmullRomCurve3,
  Shape,
  ExtrudeGeometry,
  Group,
  MeshPhysicalNodeMaterial,
  Mesh,
  Sphere,
  MeshBasicNodeMaterial,
  BackSide,
  InstancedMesh,
  MeshStandardNodeMaterial,
  Matrix4,
  PerspectiveCamera,
  Scene,
  NoToneMapping,
  type BufferGeometry,
  type Texture,
  type NodeBuilder,
  type Node,
  type Renderer,
} from 'three/webgpu'
import {
  bumpMap,
  cameraPosition,
  mix,
  mx_noise_float,
  normalView,
  normalWorld,
  pmremTexture,
  positionLocal,
  positionViewDirection,
  positionWorld,
  reflect,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { bubblePoint, type BubbleSeed } from './ambient-motion'
import { FaceMotion } from './face-motion'
import { hostPose, poseFacePoint } from './expression'
import { JellyPhysics } from './physics'
import { SLIME_RECIPE, type SlimeColours } from './appearance'
import { frontSurfaceZ as frontAt, radiusAt, restPoint, seededRandom } from './shape'
import { createStudio } from './studio'
import type { OrbState } from '@/effects/PixelOrb/types'

const WIDTH = 1.66
const DEPTH = 1.18
/** Absorption alone cannot illuminate glass on a dark page; retain the approved jade fill. */
function scatteringColour(colours: SlimeColours) {
  const dark = colours.stage.r * 0.2126 + colours.stage.g * 0.7152 + colours.stage.b * 0.0722 < 0.05
  return colours.glow
    .clone()
    .multiplyScalar(dark ? 1 : 0)
    .add(colours.body.clone().multiplyScalar(dark ? 0.2 : 0))
}

const restVertices = new WeakMap<BufferGeometry, Float32Array>()
function remember(geometry: BufferGeometry) {
  restVertices.set(geometry, Float32Array.from(geometry.attributes.position.array))
  const attribute = geometry.attributes.position
  if ('setUsage' in attribute) attribute.setUsage(DynamicDrawUsage)
  return geometry
}

function makeBody() {
  const sphere = new SphereGeometry(1, SLIME_RECIPE.widthSegments, SLIME_RECIPE.heightSegments)
  sphere.deleteAttribute('uv')
  sphere.deleteAttribute('normal')
  const geometry = mergeVertices(sphere, 1e-5)
  sphere.dispose()
  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i++) {
    const point = restPoint(positions.getX(i), positions.getY(i), positions.getZ(i))
    positions.setXYZ(i, point.x, point.y, point.z)
  }
  geometry.computeVertexNormals()
  return remember(geometry)
}

// Sculpted surface patches, not rigid eye meshes. Every point uses the body field.
function makeEye(cx: number) {
  const geometry = new SphereGeometry(1, 32, 24)
  const p = geometry.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = cx + p.getX(i) * 0.128
    const y = 1.2 + p.getY(i) * 0.137
    p.setXYZ(i, x, y, frontAt(x, y) + 0.009 + p.getZ(i) * 0.055)
  }
  geometry.computeVertexNormals()
  return geometry
}

function makeMouth(open = false) {
  const points = []
  for (let i = 0; i <= 24; i++) {
    const angle = (i / 24 - 0.5) * (open ? Math.PI * 2 : 2.7)
    const x = (open ? 0.052 : 0.1) * Math.sin(angle)
    const y = (open ? 1.075 : 1.111) - (open ? 0.065 : 0.076) * Math.cos(angle)
    points.push(new Vector3(x, y, frontAt(x, y) + 0.023))
  }
  const tube = new TubeGeometry(new CatmullRomCurve3(points), 48, 0.014, 12, false)
  const caps = [points[0], points[points.length - 1]].map((point) =>
    new SphereGeometry(0.014, 12, 8).translate(point.x, point.y, point.z),
  )
  const mouth = mergeGeometries([tube, ...caps])
  if (!mouth) throw new Error('Invalid mouth geometry')
  ;[tube, ...caps].forEach((geometry) => geometry.dispose())
  return mouth
}

function makeStarGeometry(outerRadius = 0.052, innerRadius = 0.023, thickness = 0.015) {
  const shape = new Shape()
  const points = 5
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.007,
    bevelThickness: 0.007,
  })
  geometry.center()
  return geometry
}

function makeSlime(physics: JellyPhysics, environment: Texture, colours: SlimeColours) {
  const group = new Group()
  group.name = 'softie'
  const gel = new MeshPhysicalNodeMaterial({
    color: colours.light,
    metalness: 0,
    roughness: 0.018,
    transmission: 1,
    thickness: 2.4,
    ior: 1.46,
    attenuationColor: colours.attenuation.clone(),
    attenuationDistance: 2.4,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    specularIntensity: 1,
    envMapIntensity: 1.1,
  })
  const tint = uniform(gel.attenuationColor)
  const scattering = uniform(scatteringColour(colours))
  gel.emissiveNode = scattering
  const stageTint = uniform(colours.stage.clone())
  const facing = normalView.dot(positionViewDirection).abs().clamp(0, 1)
  // Tint only transmitted light; a short optical path stays clear at the silhouette.
  gel.thicknessNode = facing.pow(0.55).mul(2.25).add(0.15)
  // Grazing Fresnel writes a gray stroke the volume cannot tint. Replace only
  // that limb in the final output; the interior lighting stays clear glass.
  const limb = facing.smoothstep(0.14, 0.34).oneMinus()
  const candy = mix(stageTint, tint, 0.7)
  const setupOutput = gel.setupOutput.bind(gel)
  gel.setupOutput = function setupOutputRim(builder: NodeBuilder, outputNode: Node) {
    // NodeMaterial output is RGBA; upstream declarations erase its vector dimension.
    const rgba = outputNode as Node<'vec4'>
    const rimmed = mix(rgba, vec4(candy, rgba.a), limb)
    return setupOutput(builder, rimmed)
  }
  // Very shallow surface undulations break up perfectly plastic softbox outlines.
  gel.normalNode = bumpMap(mx_noise_float(positionLocal.mul(9)), uniform(0.012))
  gel.clearcoatNormalNode = gel.normalNode
  const body = new Mesh(makeBody(), gel)
  body.geometry.boundingSphere = new Sphere(new Vector3(0, 1.2, 0), 6)
  body.name = 'deformable-gel'
  body.frustumCulled = false
  group.add(body)

  // Render the rear interface into the transmission buffer. The front glass then
  // refracts its reflections, rather than only sampling the featureless page color.
  const rearMaterial = new MeshBasicNodeMaterial({
    side: BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const rearDirection = reflect(positionWorld.sub(cameraPosition).normalize(), normalWorld)
  const rearReflection = pmremTexture(environment, rearDirection, uniform(0.025)).rgb
  const rearFresnel = facing.oneMinus().pow(3).mul(0.85).add(0.035)
  rearMaterial.colorNode = mix(stageTint, rearReflection.mul(tint.rgb.pow(0.3)), rearFresnel)
  rearMaterial.maskNode = facing.greaterThan(0.12)
  const rear = new Mesh(body.geometry, rearMaterial)
  rear.name = 'rear-glass-interface'
  rear.renderOrder = -1
  rear.frustumCulled = false
  group.add(rear)

  const black = new MeshPhysicalNodeMaterial({
    color: colours.face,
    roughness: 0.17,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.45,
    transparent: true,
    depthWrite: false,
  })
  const faceParts = [makeEye(-0.41), makeEye(0.41), makeMouth()]
  const eyeVertices = faceParts[0].attributes.position.count
  const mergedFace = mergeGeometries(faceParts)
  if (!mergedFace) throw new Error('Invalid face geometry')
  const faceGeometry = remember(mergedFace)
  faceParts.forEach((g) => g.dispose())
  const openMouth = makeMouth(true)
  const mouthTarget = Float32Array.from(openMouth.attributes.position.array)
  openMouth.dispose()
  const faceMotion = new FaceMotion()
  const posed = Float32Array.from(restVertices.get(faceGeometry)!)
  // Save each point's distance from the gel surface, then reproject after posing.
  const faceDepth = new Float32Array(posed.length / 3)
  const mouthDepth = new Float32Array(mouthTarget.length / 3)
  for (let i = 0; i < faceDepth.length; i++)
    faceDepth[i] = posed[i * 3 + 2] - frontAt(posed[i * 3], posed[i * 3 + 1])
  for (let i = 0; i < mouthDepth.length; i++)
    mouthDepth[i] = mouthTarget[i * 3 + 2] - frontAt(mouthTarget[i * 3], mouthTarget[i * 3 + 1])
  const face = new Mesh(faceGeometry, black)
  face.name = 'skin-attached-face'
  face.renderOrder = 2
  face.frustumCulled = false
  group.add(face)

  // Air pockets use faint reflective shells, composited after the refractive gel.
  // This avoids magnifying small pockets into beads in the screen-space refraction.
  const bubbleGeometry = new SphereGeometry(1, 12, 8)
  const bubbleMaterial = new MeshPhysicalNodeMaterial({
    color: colours.body.clone().lerp(colours.light, 0.65),
    metalness: 0,
    roughness: 0.028,
    clearcoat: 1,
    envMapIntensity: 1.1,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  // An air pocket has a reflective edge, not a solid candy-colored core.
  const bubbleGlint = normalView
    .dot(vec3(-0.3, 0.45, 0.85).normalize())
    .max(0)
    .pow(48)
  bubbleMaterial.opacityNode = normalView
    .dot(positionViewDirection)
    .abs()
    .oneMinus()
    .pow(3)
    .mul(0.45)
    .add(bubbleGlint.mul(0.8))
    .add(0.008)
    .clamp(0, 1)
  const count = SLIME_RECIPE.bubbleCount
  const bubbles = new InstancedMesh(bubbleGeometry, bubbleMaterial, count)
  bubbles.instanceMatrix.setUsage(DynamicDrawUsage)
  bubbles.frustumCulled = false
  bubbles.name = 'suspended-air-bubbles'
  bubbles.renderOrder = 1
  const random = seededRandom(71561)
  const bubbleSeeds: BubbleSeed[] = []
  for (let i = 0; i < count; i++) {
    const y = 0.19 + random() * 1.96
    const x = (random() * 2 - 1) * WIDTH * radiusAt(y) * 0.89
    const front = frontAt(x, y)
    const z = front * (0.15 + random() * 0.8)
    const size = 0.009 + Math.pow(random(), 2.8) * 0.033
    const radius = radiusAt(y)
    bubbleSeeds.push({
      x: x / (WIDTH * radius),
      y,
      z: Math.min(front - size * 2.3, z) / (DEPTH * radius),
      size,
      phase: random() * Math.PI * 2,
    })
  }
  group.add(bubbles)

  // 3D Dizzy Stars: Gold cartoon stars orbiting above crown during dizzy reaction
  const starGeometry = makeStarGeometry()
  const starMaterial = new MeshStandardNodeMaterial({
    color: colours.star,
    emissive: colours.starGlow,
    emissiveIntensity: 0.45,
    roughness: 0.16,
    metalness: 0.84,
    transparent: true,
    depthWrite: false,
  })
  const dizzyStarsGroup = new Group()
  dizzyStarsGroup.name = 'dizzy-stars-halo'
  dizzyStarsGroup.visible = false
  const STAR_COUNT = 5
  const stars: Mesh<ExtrudeGeometry, MeshStandardNodeMaterial>[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    const starMesh = new Mesh(starGeometry, starMaterial)
    starMesh.name = `dizzy-star-${i}`
    starMesh.frustumCulled = false
    dizzyStarsGroup.add(starMesh)
    stars.push(starMesh)
  }
  group.add(dizzyStarsGroup)

  const p = { x: 0, y: 0, z: 0 }
  const bubbleP = { x: 0, y: 0, z: 0, scale: 0 }
  const crownP = { x: 0, y: 0, z: 0 }
  const matrix = new Matrix4()
  const geometries = [body.geometry, face.geometry]
  return {
    group,
    body,
    face,
    bubbles,
    gel,
    faceMotion,
    dizzyStars: dizzyStarsGroup,
    bodyRest: restVertices.get(body.geometry)!,
    faceRest: restVertices.get(faceGeometry)!,
    posed,
    bubbleSeeds,
    stars,
    updateColours(c: SlimeColours, nextEnvironment: Texture) {
      gel.color.copy(c.light)
      gel.attenuationColor.copy(c.attenuation)
      scattering.value.copy(scatteringColour(c))
      stageTint.value.copy(c.stage)
      black.color.copy(c.face)
      bubbleMaterial.color.copy(c.body).lerp(c.light, 0.65)
      starMaterial.color.copy(c.star)
      starMaterial.emissive.copy(c.starGlow)
      rearMaterial.colorNode = mix(
        stageTint,
        pmremTexture(nextEnvironment, rearDirection, uniform(0.025)).rgb.mul(tint.rgb.pow(0.3)),
        rearFresnel,
      )
      rearMaterial.needsUpdate = true
    },
    update(time: number, host: OrbState = 'idle') {
      group.position.copy(physics.position)
      // A sustained privacy eyelid must read as a dark lid, not a flattened white specular flash.
      black.roughness = host === 'sleeping' ? 0.65 : 0.17
      black.clearcoat = host === 'sleeping' ? 0.1 : 0.85
      black.envMapIntensity = host === 'sleeping' ? 0.12 : 0.45
      const expression = hostPose(faceMotion.update(time), host)
      const restFace = restVertices.get(faceGeometry)!
      for (let i = 0; i < faceDepth.length; i++) {
        poseFacePoint(
          i,
          restFace,
          eyeVertices,
          mouthTarget,
          faceDepth,
          mouthDepth,
          expression,
          time,
          host,
          posed,
        )
      }
      for (const geometry of geometries) {
        const rest = geometry === faceGeometry ? posed : restVertices.get(geometry)!
        const positions = geometry.attributes.position
        for (let i = 0; i < positions.count; i++) {
          const n = i * 3
          physics.deform(rest[n], rest[n + 1], rest[n + 2], p)
          positions.setXYZ(i, p.x, p.y, p.z)
        }
        positions.needsUpdate = true
        geometry.computeVertexNormals()
        geometry.boundingSphere = null
        geometry.boundingBox = null
      }
      for (let i = 0; i < count; i++) {
        const b = bubbleSeeds[i]
        bubblePoint(b, time, bubbleP)
        const size = bubbleP.scale
        physics.deform(bubbleP.x, bubbleP.y, bubbleP.z, p)
        matrix.makeScale(size, size * 1.12, size)
        matrix.setPosition(p.x, p.y, p.z)
        bubbles.setMatrixAt(i, matrix)
      }
      bubbles.instanceMatrix.needsUpdate = true

      // Update 3D Dizzy Stars Halo above the slime crown
      const dizzy = expression.dizzy ?? 0
      if (dizzy <= 1e-4) {
        if (dizzyStarsGroup.visible) dizzyStarsGroup.visible = false
      } else {
        dizzyStarsGroup.visible = true
        // Anchor to the dynamically deformed crown apex (tuft) of the jelly
        physics.deform(0, 2.38, 0, crownP)
        dizzyStarsGroup.position.set(crownP.x, crownP.y + 0.3, crownP.z)
        // Tilted halo plane for cartoon 3D perspective
        dizzyStarsGroup.rotation.x = 0.32 + Math.sin(time * 3.5) * 0.05
        dizzyStarsGroup.rotation.z = Math.cos(time * 3.0) * 0.05

        const orbitRadius = (0.38 + Math.sin(time * 5.0) * 0.02) * Math.min(1, dizzy * 1.35)
        const baseScale = Math.min(1, dizzy * 1.35)
        starMaterial.opacity = Math.min(1, dizzy * 1.8)

        for (let i = 0; i < STAR_COUNT; i++) {
          const star = stars[i]
          const orbitAngle = time * 6.6 + (i * Math.PI * 2) / STAR_COUNT
          // Undulating wave pattern along the circular halo
          const wobbleY = Math.sin(time * 7.5 + i * 1.25) * 0.042
          star.position.set(
            Math.cos(orbitAngle) * orbitRadius,
            wobbleY,
            Math.sin(orbitAngle) * orbitRadius,
          )
          // Star self-rotation and sparkling micro-twinkle
          star.rotation.y = time * 8.5 + i * 1.8
          star.rotation.z = time * 6.0 + i * 1.2
          star.rotation.x = Math.sin(time * 6.5 + i) * 0.5
          const twinkle = 1 + 0.14 * Math.sin(time * 13 + i * 2.1)
          star.scale.setScalar(baseScale * twinkle)
        }
      }
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      gel.dispose()
      rearMaterial.dispose()
      black.dispose()
      bubbles.dispose()
      bubbleGeometry.dispose()
      bubbleMaterial.dispose()
      starGeometry.dispose()
      starMaterial.dispose()
    },
  }
}

/** Host framing, lighting and ownership stay outside the source character kernel. */
export function createSlimeScene(
  renderer: Renderer,
  colours: SlimeColours,
  physics = new JellyPhysics(),
) {
  const scene = new Scene()
  scene.background = null
  renderer.setClearColor(0, 0)
  renderer.toneMapping = NoToneMapping
  const camera = new PerspectiveCamera(32, 1, 0.1, 40)
  camera.position.set(0, 3.05, 9.8)
  camera.lookAt(0, 1.15, 0)
  const studio = createStudio(renderer, scene, colours)
  const slime = makeSlime(physics, studio.environment, colours)
  scene.add(slime.group)
  let disposed = false
  return {
    scene,
    camera,
    actor: slime.group,
    body: slime.body,
    bodyRest: slime.bodyRest,
    face: slime.face,
    faceRest: slime.faceRest,
    posed: slime.posed,
    bubbles: slime.bubbles,
    bubbleSeeds: slime.bubbleSeeds,
    stars: slime.stars,
    dizzyStars: slime.dizzyStars,
    faceMotion: slime.faceMotion,
    studio,
    update(time: number, state: OrbState) {
      slime.update(time, state)
      studio.update(physics.position)
    },
    resize(
      width: number,
      height: number,
      left = 0,
      top = 0,
      canvasWidth = width,
      canvasHeight = height,
    ) {
      camera.aspect = width / height
      const visibleHeight = Math.max(SLIME_RECIPE.viewHeight, 4.45 / camera.aspect)
      const distance = visibleHeight / (2 * Math.tan((16 * Math.PI) / 180))
      camera.position.set(0, 1.1 + distance * 0.15, distance)
      camera.lookAt(0, 1.1, 0)
      camera.setViewOffset(width, height, -left, -top, canvasWidth, canvasHeight)
      camera.updateProjectionMatrix()
      const unit = visibleHeight / height
      const horizontalRoom = Math.min(width / 2 + left, canvasWidth - left - width / 2) * unit
      physics.setBounds(horizontalRoom - 2.05, 1.1 + visibleHeight / 2 + top * unit - 3.2)
    },
    updateColours(c: SlimeColours) {
      studio.updateColours(c)
      slime.updateColours(c, studio.environment)
    },
    dispose() {
      if (disposed) return
      disposed = true
      slime.dispose()
      studio.dispose()
    },
  }
}
export type SlimeScene = ReturnType<typeof createSlimeScene>
