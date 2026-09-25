/** Adapted from yuanyang749/softie-webgpu, MIT, Copyright (c) 2026 yuanyang749.
 * Source: https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f
 * Changes: TypeScript, Apocalypse host/lifecycle integration. See public/licenses/softie-webgpu.txt.
 */
import {
  DynamicDrawUsage,
  SphereGeometry,
  IcosahedronGeometry,
  BufferGeometry,
  Float32BufferAttribute,
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
  type Texture,
  type NodeBuilder,
  type Node,
  type Renderer,
} from 'three/webgpu'
import {
  attribute,
  cameraPosition,
  materialColor,
  mix,
  normalLocal,
  normalView,
  normalWorld,
  pmremTexture,
  positionViewDirection,
  positionWorld,
  reflect,
  transformNormalToView,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { bubblePoint, type BubbleSeed } from './ambient-motion'
import { FaceMotion } from './face-motion'
import { hostPose, poseFacePoint } from './expression'
import { JellyPhysics } from './physics'
import { SLIME_RECIPE, type SlimeColours } from './appearance'
import {
  BODY_DEPTH,
  BODY_TOP,
  BODY_WIDTH,
  FACE_X,
  frontSurfaceZ as frontAt,
  radiusAt,
  restPoint,
  seededRandom,
  type Point3,
} from './shape'
import { createStudio } from './studio'
import type { OrbState } from '@/effects/PixelOrb/types'

/** Absorption alone cannot illuminate glass on a dark page; retain the approved jade fill. */
function scatteringColour(colours: SlimeColours) {
  const dark = colours.stage.r * 0.2126 + colours.stage.g * 0.7152 + colours.stage.b * 0.0722 < 0.05
  return colours.glow
    .clone()
    .multiplyScalar(dark ? 0.12 : 0)
    .add(colours.body.clone().multiplyScalar(dark ? 0.04 : 0))
}

const restVertices = new WeakMap<BufferGeometry, Float32Array>()
function remember(geometry: BufferGeometry) {
  restVertices.set(geometry, Float32Array.from(geometry.attributes.position.array))
  const attribute = geometry.attributes.position
  if ('setUsage' in attribute) attribute.setUsage(DynamicDrawUsage)
  return geometry
}

function makeBody() {
  // The design has a smooth silhouette and a few broad optical planes. Keep
  // the elastic surface continuous, then blend coarse facet normals across
  // rounded boundaries. Displacing whole triangles created visible ridges.
  const source = new IcosahedronGeometry(1, 0)
  source.rotateY(0.37)
  source.rotateZ(0.19)
  const sourcePositions = source.getAttribute('position')
  const sourceIndices = source.getIndex()
  const positions: number[] = []
  const indices: number[] = []
  const blends: number[] = []
  const tones: number[] = []
  const owners: number[] = []
  const corners: [Point3, Point3, Point3][] = []
  const shared = new Map<string, number>()
  const subdivisions = 12
  const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  const vertex = (index: number) => {
    const v = sourceIndices ? sourceIndices.getX(index) : index
    return new Vector3(
      sourcePositions.getX(v),
      sourcePositions.getY(v),
      sourcePositions.getZ(v),
    ).normalize()
  }
  const faceCount = (sourceIndices?.count ?? sourcePositions.count) / 3
  for (let face = 0; face < faceCount; face++) {
    const a = vertex(face * 3)
    const b = vertex(face * 3 + 1)
    const c = vertex(face * 3 + 2)
    const pa = restPoint(a.x, a.y, a.z)
    const pb = restPoint(b.x, b.y, b.z)
    const pc = restPoint(c.x, c.y, c.z)
    corners.push([pa, pb, pc])
    const planeNormal = new Vector3(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z)
      .cross(new Vector3(pc.x - pa.x, pc.y - pa.y, pc.z - pa.z))
      .normalize()
    if (
      planeNormal.x * (pa.x + pb.x + pc.x) +
        planeNormal.y * (pa.y + pb.y + pc.y - 4.2) +
        planeNormal.z * (pa.z + pb.z + pc.z) <
      0
    )
      planeNormal.negate()
    const tone = Math.max(0.08, Math.min(0.92, 0.48 + planeNormal.x * 0.34 + planeNormal.y * 0.1))
    const rows: number[][] = []
    for (let i = 0; i <= subdivisions; i++) {
      const row: number[] = []
      for (let j = 0; j <= subdivisions - i; j++) {
        const wb = i / subdivisions
        const wc = j / subdivisions
        const wa = 1 - wb - wc
        const direction = new Vector3()
          .addScaledVector(a, wa)
          .addScaledVector(b, wb)
          .addScaledVector(c, wc)
          .normalize()
        const point = restPoint(direction.x, direction.y, direction.z)
        const key = [point.x, point.y, point.z].map((value) => Math.round(value * 1e5)).join(',')
        let index = shared.get(key)
        if (index === undefined) {
          index = positions.length / 3
          shared.set(key, index)
          positions.push(point.x, point.y, point.z)
          owners.push(face)
          tones.push(tone)
          const faceDistance = Math.hypot(point.x / 0.95, (point.y - 1.48) / 0.6)
          const faceClearance =
            point.z > 0.55 ? 0.55 * (1 - smoothstep(0.8, 1.25, faceDistance)) : 0
          const edge = smoothstep(0, 0.18, Math.min(wa, wb, wc))
          blends.push(edge * (1 - faceClearance) * smoothstep(0.08, 0.42, point.y) * 0.9)
        }
        row.push(index)
      }
      rows.push(row)
    }
    for (let i = 0; i < subdivisions; i++) {
      for (let j = 0; j < subdivisions - i; j++) {
        indices.push(rows[i][j], rows[i + 1][j], rows[i][j + 1])
        if (j < subdivisions - i - 1)
          indices.push(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1])
      }
    }
  }
  source.dispose()
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  const facetNormal = new Float32BufferAttribute(new Float32Array(positions.length), 3)
  facetNormal.setUsage(DynamicDrawUsage)
  geometry.setAttribute('facetNormal', facetNormal)
  geometry.setAttribute('facetBlend', new Float32BufferAttribute(blends, 1))
  geometry.setAttribute('facetShade', new Float32BufferAttribute(tones, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return { geometry: remember(geometry), corners, owners }
}

// Sculpted surface patches, not rigid eye meshes. Every point uses the body field.
function makeEye(cx: number) {
  const geometry = new SphereGeometry(1, 32, 24)
  const p = geometry.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = cx + p.getX(i) * 0.112
    const y = 1.62 + p.getY(i) * 0.12
    p.setXYZ(i, x, y, frontAt(x, y) + 0.009 + p.getZ(i) * 0.055)
  }
  geometry.computeVertexNormals()
  return geometry
}

function makeMouth(open = false) {
  const points = []
  for (let i = 0; i <= 24; i++) {
    const angle = (i / 24 - 0.5) * (open ? Math.PI * 2 : 2.7)
    const x = FACE_X + (open ? 0.068 : 0.13) * Math.sin(angle)
    const y = (open ? 1.5 : 1.535) - (open ? 0.08 : 0.09) * Math.cos(angle)
    points.push(new Vector3(x, y, frontAt(x, y) + 0.035))
  }
  const tube = new TubeGeometry(new CatmullRomCurve3(points), 48, 0.017, 12, false)
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
  group.name = 'apo'
  const gel = new MeshPhysicalNodeMaterial({
    color: colours.body,
    metalness: 0,
    roughness: SLIME_RECIPE.roughness,
    transmission: SLIME_RECIPE.transmission,
    thickness: SLIME_RECIPE.thickness,
    ior: SLIME_RECIPE.ior,
    attenuationColor: colours.attenuation.clone(),
    attenuationDistance: SLIME_RECIPE.attenuationDistance,
    clearcoat: 0.75,
    clearcoatRoughness: 0.055,
    specularIntensity: 0.7,
    envMapIntensity: 0.8,
  })
  const tint = uniform(gel.attenuationColor)
  const facetDark = uniform(colours.attenuation.clone().lerp(colours.shadow, 0.25))
  const facetLight = uniform(colours.body.clone().lerp(colours.light, 0.55))
  const scattering = uniform(scatteringColour(colours))
  const stageTint = uniform(colours.stage.clone())
  const facing = normalView.dot(positionViewDirection).abs().clamp(0, 1)
  const facetBlend = attribute('facetBlend', 'float')
  const facetColour = mix(facetDark, facetLight, attribute('facetShade', 'float'))
  gel.colorNode = mix(
    materialColor,
    facetColour,
    (facetBlend as unknown as Node<'float'>).mul(0.65),
  )
  gel.attenuationColorNode = mix(
    tint,
    facetColour,
    (facetBlend as unknown as Node<'float'>).mul(0.65),
  )
  gel.emissiveNode = scattering

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
    const opticalPlane = (facetBlend as unknown as Node<'float'>).mul(0.65).mul(limb.oneMinus())
    const faceted = vec4(mix(rimmed.rgb, facetColour, opticalPlane), rimmed.a)
    return setupOutput(builder, faceted)
  }
  gel.normalNode = transformNormalToView(
    mix(
      normalLocal,
      attribute('facetNormal', 'vec3'),
      (facetBlend as unknown as Node<'float'>).mul(0.03),
    ).normalize(),
  )
  gel.clearcoatNormalNode = gel.normalNode
  const facetedBody = makeBody()
  const body = new Mesh(facetedBody.geometry, gel)
  body.geometry.boundingSphere = new Sphere(new Vector3(0, 1.2, 0), 6)
  body.name = 'deformable-gel'
  body.frustumCulled = false
  group.add(body)
  const facetAttribute = body.geometry.getAttribute('facetNormal')
  const facetNormals = facetedBody.corners.map(() => new Vector3())
  const fa: Point3 = { x: 0, y: 0, z: 0 }
  const fb: Point3 = { x: 0, y: 0, z: 0 }
  const fc: Point3 = { x: 0, y: 0, z: 0 }
  const updateFacetNormals = () => {
    for (let i = 0; i < facetedBody.corners.length; i++) {
      const [a, b, c] = facetedBody.corners[i]
      physics.deform(a.x, a.y, a.z, fa)
      physics.deform(b.x, b.y, b.z, fb)
      physics.deform(c.x, c.y, c.z, fc)
      const normal = facetNormals[i]
      normal.set(fb.x - fa.x, fb.y - fa.y, fb.z - fa.z)
      const edgeX = fc.x - fa.x
      const edgeY = fc.y - fa.y
      const edgeZ = fc.z - fa.z
      normal
        .set(
          normal.y * edgeZ - normal.z * edgeY,
          normal.z * edgeX - normal.x * edgeZ,
          normal.x * edgeY - normal.y * edgeX,
        )
        .normalize()
      const centerX = (fa.x + fb.x + fc.x) / 3
      const centerY = (fa.y + fb.y + fc.y) / 3 - 1.4
      const centerZ = (fa.z + fb.z + fc.z) / 3
      if (normal.x * centerX + normal.y * centerY + normal.z * centerZ < 0) normal.negate()
    }
    for (let i = 0; i < facetedBody.owners.length; i++) {
      const normal = facetNormals[facetedBody.owners[i]]
      facetAttribute.setXYZ(i, normal.x, normal.y, normal.z)
    }
    facetAttribute.needsUpdate = true
  }
  updateFacetNormals()

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
  const faceParts = [makeEye(FACE_X - 0.53), makeEye(FACE_X + 0.53), makeMouth()]
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
    .mul(0.2)
    .add(bubbleGlint.mul(0.28))
    .add(0.005)
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
    const x = (random() * 2 - 1) * BODY_WIDTH * radiusAt(y) * 0.89
    const front = frontAt(x, y)
    const z = front * (0.15 + random() * 0.8)
    const size = 0.009 + Math.pow(random(), 2.8) * 0.033
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
    updateColours(c: SlimeColours, nextEnvironment: Texture) {
      gel.color.copy(c.body)
      gel.attenuationColor.copy(c.attenuation)
      scattering.value.copy(scatteringColour(c))
      facetDark.value.copy(c.attenuation).lerp(c.shadow, 0.25)
      facetLight.value.copy(c.body).lerp(c.light, 0.55)
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
      updateFacetNormals()
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
        physics.deform(0, BODY_TOP, 0, crownP)
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
      camera.position.set(0, 1.46 + distance * 0.15, distance)
      camera.lookAt(0, 1.46, 0)
      camera.setViewOffset(width, height, -left, -top, canvasWidth, canvasHeight)
      camera.updateProjectionMatrix()
      const unit = visibleHeight / height
      const horizontalRoom = Math.min(width / 2 + left, canvasWidth - left - width / 2) * unit
      physics.setBounds(horizontalRoom - 2.05, 1.46 + visibleHeight / 2 + top * unit - 3.2)
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
