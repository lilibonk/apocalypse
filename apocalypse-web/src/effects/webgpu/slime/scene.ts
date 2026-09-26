/** Adapted from yuanyang749/softie-webgpu, MIT, Copyright (c) 2026 yuanyang749.
 * Source: https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f
 * Changes: TypeScript, Apocalypse host/lifecycle integration. See public/licenses/softie-webgpu.txt.
 */
import {
  DynamicDrawUsage,
  Float32BufferAttribute,
  SphereGeometry,
  Vector3,
  TubeGeometry,
  CatmullRomCurve3,
  Shape,
  ExtrudeGeometry,
  Group,
  MeshPhysicalNodeMaterial,
  MeshBasicNodeMaterial,
  MeshSSSNodeMaterial,
  Mesh,
  Sphere,
  InstancedMesh,
  MeshStandardNodeMaterial,
  Matrix4,
  PerspectiveCamera,
  Scene,
  NoToneMapping,
  type BufferGeometry,
  type Renderer,
  type Texture,
} from 'three/webgpu'
import {
  attribute,
  float,
  mix,
  normalLocal,
  normalView,
  positionViewDirection,
  texture,
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
import {
  BODY_WIDTH,
  BODY_DEPTH,
  BODY_TOP,
  CROWN,
  FACE_LEFT,
  FACE_RIGHT,
  FACE_MOUTH,
  FACE_EYE_RADIUS,
  frontSurfaceZ as frontAt,
  radiusAt,
  restPoint,
  seededRandom,
} from './shape'
import { createStudio } from './studio'
import { skinUv } from './skin-projection'
import type { OrbState } from '@/effects/PixelOrb/types'

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
function makeEye(center: { x: number; y: number }) {
  const geometry = new SphereGeometry(1, 32, 24)
  const p = geometry.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = center.x + p.getX(i) * FACE_EYE_RADIUS
    const y = center.y + p.getY(i) * FACE_EYE_RADIUS * 1.18
    p.setXYZ(i, x, y, frontAt(x, y) + 0.006 + p.getZ(i) * 0.038)
  }
  geometry.computeVertexNormals()
  return geometry
}

function makeMouth(open = false) {
  const points = []
  for (let i = 0; i <= 24; i++) {
    const angle = (i / 24 - 0.5) * (open ? Math.PI * 2 : 2.7)
    const localX = (open ? 0.055 : 0.101) * Math.sin(angle)
    const x = FACE_MOUTH.x + localX
    const y = FACE_MOUTH.y - 0.065 * Math.cos(angle) + localX * 0.48
    points.push(new Vector3(x, y, frontAt(x, y) + 0.02))
  }
  const curve = new CatmullRomCurve3(points)
  const tube = new TubeGeometry(curve, 48, 0.017, 12, false)
  if (!open) {
    const position = tube.attributes.position
    for (let i = 0; i <= 48; i++) {
      const center = curve.getPointAt(i / 48)
      const scale = (0.01 + 0.012 * (i / 48)) / 0.017
      for (let j = 0; j <= 12; j++) {
        const index = i * 13 + j
        position.setXYZ(
          index,
          center.x + (position.getX(index) - center.x) * scale,
          center.y + (position.getY(index) - center.y) * scale,
          center.z + (position.getZ(index) - center.z) * scale,
        )
      }
    }
    tube.computeVertexNormals()
  }
  const caps = [points[0], points[points.length - 1]].map((point, index) =>
    new SphereGeometry(open ? 0.014 : index === 0 ? 0.01 : 0.022, 12, 8).translate(
      point.x,
      point.y,
      point.z,
    ),
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

function makeSlime(physics: JellyPhysics, colours: SlimeColours, skinTexture?: Texture) {
  const group = new Group()
  group.name = 'apo-milk-cloud'
  const gel = new MeshSSSNodeMaterial({
    color: colours.body,
    metalness: 0,
    roughness: SLIME_RECIPE.roughness,
    transmission: SLIME_RECIPE.transmission,
    thickness: SLIME_RECIPE.thickness,
    ior: SLIME_RECIPE.ior,
    attenuationColor: colours.attenuation.clone(),
    attenuationDistance: SLIME_RECIPE.attenuationDistance,
    clearcoat: 0.04,
    clearcoatRoughness: 0.5,
    specularIntensity: 0.2,
    envMapIntensity: 0.28,
  })
  // Pigment is bound to the resting skin, so the cream and blush deform with it.
  const skin = attribute<'vec3'>('skinPosition', 'vec3')
  const mint = uniform(colours.body.clone())
  const cream = uniform(colours.cream.clone())
  const blush = uniform(colours.blush.clone())
  const skinTint = uniform(colours.skinTint.clone())
  const patch = (x: number, y: number, width: number, height: number) =>
    skin.x.sub(x).div(width).pow(2).add(skin.y.sub(y).div(height).pow(2)).negate().exp()
  const lowerMint = patch(-0.12, 0.37, 1.55, 0.32).mul(0.83)
  const shoulderMint = skin.y
    .sub(skin.x.mul(0.18).add(2.04))
    .div(0.23)
    .pow(2)
    .add(skin.x.add(0.4).div(1.1).pow(2))
    .negate()
    .exp()
    .mul(0.52)
  const sideMint = patch(-1.35, 1.4, 0.3, 0.9).mul(0.35)
  const creamAmount = float(0.97).sub(lowerMint).sub(shoulderMint).sub(sideMint).clamp(0, 1)
  const cheek = (x: number, y: number) =>
    skin.x.sub(x).div(0.34).pow(2).add(skin.y.sub(y).div(0.24).pow(2)).mul(-1.6).exp()
  const warmth = cheek(FACE_LEFT.x - 0.21, FACE_LEFT.y - 0.18)
    .add(cheek(FACE_RIGHT.x + 0.2, FACE_RIGHT.y - 0.15))
    .mul(skin.z.smoothstep(0.3, 0.75))
    .mul(0.76)
    .clamp(0, 0.8)
  gel.colorNode = mix(mix(mint, cream, creamAmount), blush, warmth)
  gel.thicknessColorNode = mix(mint, cream, 0.75)
  gel.thicknessDistortionNode = float(0.2)
  gel.thicknessAmbientNode = float(0.06)
  gel.thicknessAttenuationNode = float(0.1)
  gel.thicknessPowerNode = float(2)
  gel.thicknessScaleNode = float(2.2)
  const body = new Mesh(makeBody(), gel)
  body.geometry.setAttribute(
    'skinPosition',
    new Float32BufferAttribute(restVertices.get(body.geometry)!, 3),
  )
  if (skinTexture) {
    const rest = restVertices.get(body.geometry)!
    const uv = new Float32Array((rest.length / 3) * 2)
    for (let i = 0; i < rest.length / 3; i++) {
      const mapped = skinUv(rest[i * 3], rest[i * 3 + 1])
      uv[i * 2] = mapped.u
      uv[i * 2 + 1] = mapped.v
    }
    body.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    body.geometry.setAttribute(
      'skinNormal',
      new Float32BufferAttribute(Float32Array.from(body.geometry.attributes.normal.array), 3),
    )
    const restNormal = attribute<'vec3'>('skinNormal', 'vec3').normalize()
    const light = vec3(-0.4, 0.65, 0.65).normalize()
    const motionShade = normalLocal
      .normalize()
      .dot(light)
      .sub(restNormal.dot(light))
      .mul(0.3)
      .add(1)
      .clamp(0.78, 1.15)
    const art = texture(skinTexture)
    gel.transmission = 0
    gel.outputNode = vec4(
      mix(cream, art.rgb.mul(skinTint), art.a.smoothstep(0.25, 0.9)).mul(motionShade),
      1,
    )
  }
  body.geometry.boundingSphere = new Sphere(new Vector3(0, 1.35, 0), 6)
  body.name = 'deformable-gel'
  body.frustumCulled = false
  group.add(body)

  const black = new MeshPhysicalNodeMaterial({
    color: colours.face,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.3,
    transparent: true,
    depthWrite: false,
  })
  const faceParts = [makeEye(FACE_LEFT), makeEye(FACE_RIGHT), makeMouth()]
  faceParts.forEach((geometry, index) =>
    geometry.setAttribute(
      'eyeHighlight',
      new Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(index < 2 ? 1 : 0),
        1,
      ),
    ),
  )
  const eyeLight = uniform(colours.light.clone())
  black.emissiveNode = eyeLight
    .mul(
      normalView
        .dot(vec3(0.38, 0.52, 0.76).normalize())
        .max(0)
        .pow(32),
    )
    .mul(attribute('eyeHighlight', 'float'))
    .mul(1.2)
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

  // Faint air-pocket shells remain visible through the diffuse milk gel.
  // Density fades toward the opaque crown without stopping their upward motion.
  const bubbleGeometry = new SphereGeometry(1, 12, 8)
  const bubbleMaterial = new MeshBasicNodeMaterial({
    color: colours.body.clone().lerp(colours.light, 0.65),
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
    .mul(0.6)
    .add(bubbleGlint.mul(0.6))
    .add(0.04)
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
    const y = 0.19 + random() ** 2 * 1.96
    const x = (random() * 2 - 1) * BODY_WIDTH * radiusAt(y) * 0.89
    const front = frontAt(x, y)
    const z = front * (0.15 + random() * 0.8)
    const size = 0.012 + Math.pow(random(), 1.5) * 0.029
    const radius = radiusAt(y)
    bubbleSeeds.push({
      x: x / (BODY_WIDTH * radius),
      y,
      z: Math.min(front - size * 2.3, z) / (BODY_DEPTH * radius),
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
    updateColours(c: SlimeColours) {
      gel.color.copy(c.body)
      gel.attenuationColor.copy(c.attenuation)
      mint.value.copy(c.body)
      cream.value.copy(c.cream)
      blush.value.copy(c.blush)
      skinTint.value.copy(c.skinTint)
      eyeLight.value.copy(c.light)
      black.color.copy(c.face)
      bubbleMaterial.color.copy(c.body).lerp(c.light, 0.65)
      starMaterial.color.copy(c.star)
      starMaterial.emissive.copy(c.starGlow)
    },
    update(time: number, host: OrbState = 'idle') {
      group.position.copy(physics.position)
      // A sustained privacy eyelid must read as a dark lid, not a flattened white specular flash.
      black.roughness = host === 'sleeping' ? 0.7 : 0.22
      black.clearcoat = host === 'sleeping' ? 0.1 : 0.6
      black.envMapIntensity = host === 'sleeping' ? 0.12 : 0.3
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
        physics.deform(CROWN.x, CROWN.y, CROWN.z, crownP)
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
      black.dispose()
      bubbles.dispose()
      bubbleGeometry.dispose()
      bubbleMaterial.dispose()
      starGeometry.dispose()
      starMaterial.dispose()
      skinTexture?.dispose()
    },
  }
}

/** Host framing, lighting and ownership stay outside the source character kernel. */
export function createSlimeScene(
  renderer: Renderer,
  colours: SlimeColours,
  physics = new JellyPhysics(),
  skinTexture?: Texture,
) {
  const scene = new Scene()
  scene.background = null
  renderer.setClearColor(0, 0)
  renderer.toneMapping = NoToneMapping
  const camera = new PerspectiveCamera(32, 1, 0.1, 40)
  camera.position.set(0, 3.05, 9.8)
  camera.lookAt(0, 1.15, 0)
  const studio = createStudio(renderer, scene, colours)
  const slime = makeSlime(physics, colours, skinTexture)
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
      const visibleHeight = Math.max(
        SLIME_RECIPE.viewHeight,
        (BODY_WIDTH * 2 + 1.25) / camera.aspect,
      )
      const distance = visibleHeight / (2 * Math.tan((16 * Math.PI) / 180))
      camera.position.set(0, 1.35 + distance * 0.09, distance)
      camera.lookAt(0, 1.35, 0)
      camera.setViewOffset(width, height, -left, -top, canvasWidth, canvasHeight)
      camera.updateProjectionMatrix()
      const unit = visibleHeight / height
      const horizontalRoom = Math.min(width / 2 + left, canvasWidth - left - width / 2) * unit
      physics.setBounds(
        horizontalRoom - BODY_WIDTH - 0.4,
        1.35 + visibleHeight / 2 + top * unit - BODY_TOP - 0.4,
      )
    },
    updateColours(c: SlimeColours) {
      studio.updateColours(c)
      slime.updateColours(c)
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
