import * as THREE from 'three'

export type CounterRowView = Readonly<{
  id: string
  count: number
}>

export type CountersSceneState = Readonly<{
  rows: ReadonlyArray<CounterRowView>
}>

export type CountersSceneCallbacks = Readonly<{
  onIncrement: (counterId: string) => void
  onDecrement: (counterId: string) => void
  onAdd: () => void
}>

type CanvasPaint = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  last: string
}

type Boid = {
  pos: THREE.Vector3
  vel: THREE.Vector3
  mesh: THREE.Mesh
  active: boolean
  scale: number
}

type Station = {
  id: string
  group: THREE.Group
  column: THREE.Mesh
  ring: THREE.Mesh
  plus: THREE.Mesh
  minus: THREE.Mesh
  numberPlane: THREE.Mesh
  romanPlane: THREE.Mesh
  balloon: THREE.Mesh
  beads: THREE.Mesh[]
  numberPaint: CanvasPaint
  romanPaint: CanvasPaint
  balloonMat: THREE.MeshStandardMaterial
  columnMat: THREE.MeshStandardMaterial
  paintedCount: number | null
  bobPhase: number
  appear: number
  boids: Boid[]
}

const ROMAN_MAP: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

export const toRoman = (n: number): string => {
  if (!Number.isFinite(n)) return '·'
  const sign = n < 0 ? '−' : ''
  let v = Math.floor(Math.abs(n))
  if (v === 0) return 'N'
  if (v > 3999) return `${sign}MMMM+`
  let out = ''
  for (const [value, glyph] of ROMAN_MAP) {
    while (v >= value) {
      out += glyph
      v -= value
    }
  }
  return sign + out
}

const isMobile = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 700px), (pointer: coarse)').matches

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v))

const damp = (
  value: number,
  target: number,
  lambda: number,
  dt: number,
): number => value + (target - value) * (1 - Math.exp(-lambda * dt))

const countColorInto = (out: THREE.Color, count: number): THREE.Color => {
  const t = clamp(count / 16, 0, 1)
  return out.setHSL(0.58 - t * 0.18, 0.38, 0.42 + t * 0.1)
}

const balloonScale = (n: number): number =>
  0.42 + Math.min(Math.max(n, 0), 20) * 0.038

const boidCap = (): number => (isMobile() ? 8 : 14)

const mulberry32 = (seed: number) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const makePaint = (width: number, height: number): CanvasPaint => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return { canvas, ctx, texture, last: '\u0000' }
}

const paintNumber = (paint: CanvasPaint, n: number): void => {
  const key = String(n)
  if (paint.last === key) return
  paint.last = key
  const { ctx, canvas, texture } = paint
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const digits = key.length
  const size = digits <= 1 ? 210 : digits === 2 ? 170 : digits === 3 ? 128 : 96
  ctx.font = `600 ${size}px "Segoe UI", "Helvetica Neue", system-ui, sans-serif`
  ctx.shadowColor = 'rgba(126, 200, 232, 0.85)'
  ctx.shadowBlur = 28
  ctx.fillStyle = '#eaf4ff'
  ctx.fillText(key, w / 2, h / 2 + 8)
  texture.needsUpdate = true
}

const paintRoman = (paint: CanvasPaint, roman: string): void => {
  if (paint.last === roman) return
  paint.last = roman
  const { ctx, canvas, texture } = paint
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const size = roman.length > 6 ? 42 : roman.length > 4 ? 52 : 64
  ctx.font = `400 ${size}px "Palatino Linotype", Palatino, "Times New Roman", serif`
  ctx.shadowColor = 'rgba(180, 210, 230, 0.45)'
  ctx.shadowBlur = 12
  ctx.fillStyle = 'rgba(196, 216, 232, 0.82)'
  ctx.fillText(roman, w / 2, h / 2)
  texture.needsUpdate = true
}

const paintGlyph = (glyph: string, color: string): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  ctx.clearRect(0, 0, 128, 128)
  ctx.fillStyle = color
  ctx.font = "600 86px 'Segoe UI', system-ui, sans-serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, 64, 70)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

const beadTargetX = (index: number, activeCount: number): number => {
  const active = index < activeCount
  const packed = active ? index : index - activeCount
  const slot = 0.078
  if (active) {
    return 0.12 + packed * slot
  }
  return -0.48 + packed * slot
}

/** Host-owned Three.js view. Core owns counts; this only renders and picks. */
export const createCountersScene = (
  container: HTMLElement,
  callbacks: CountersSceneCallbacks,
) => {
  const mobile = isMobile()
  const maxBoids = boidCap()
  const dprCap = mobile ? 1.25 : 1.75

  const renderer = new THREE.WebGLRenderer({
    antialias: !mobile,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x0b1522, 1)
  renderer.shadowMap.enabled = !mobile
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.touchAction = 'none'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1522)
  const fog = new THREE.FogExp2(0x0b1522, 0.032)
  scene.fog = fog

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80)
  const camBase = new THREE.Vector3(0, 3.55, 9.4)

  scene.add(new THREE.HemisphereLight(0xb9d4e8, 0x1a2433, 0.82))
  const key = new THREE.DirectionalLight(0xe8f1ff, 0.72)
  key.position.set(5.2, 8.2, 6.4)
  if (!mobile) {
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 28
    key.shadow.camera.left = -10
    key.shadow.camera.right = 10
    key.shadow.camera.top = 8
    key.shadow.camera.bottom = -6
    key.shadow.bias = -0.0004
  }
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x88aacc, 0.38)
  rim.position.set(-6.2, 2.2, -4.4)
  scene.add(rim)
  const fill = new THREE.DirectionalLight(0x6a90b0, 0.16)
  fill.position.set(0, 3.2, 8)
  scene.add(fill)

  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(obj: T): T => {
    disposables.push(obj)
    return obj
  }

  const columnGeo = track(new THREE.CylinderGeometry(0.28, 0.34, 1, 20))
  columnGeo.translate(0, 0.5, 0)
  const ringGeo = track(new THREE.TorusGeometry(0.72, 0.018, 8, 40))
  const buttonGeo = track(new THREE.BoxGeometry(0.52, 0.26, 0.26))
  const beadGeo = track(new THREE.SphereGeometry(0.055, 12, 10))
  const railGeo = track(new THREE.CylinderGeometry(0.016, 0.016, 1.12, 8))
  railGeo.rotateZ(Math.PI / 2)
  const balloonGeo = track(
    new THREE.SphereGeometry(0.42, mobile ? 16 : 24, mobile ? 12 : 18),
  )
  const boidGeo = track(new THREE.SphereGeometry(0.055, 10, 8))
  const numberGeo = track(new THREE.PlaneGeometry(1.7, 1.05))
  const romanGeo = track(new THREE.PlaneGeometry(1.55, 0.38))
  const glyphGeo = track(new THREE.PlaneGeometry(0.28, 0.28))
  const addPadGeo = track(new THREE.CylinderGeometry(0.58, 0.58, 0.16, 28))
  const floorGeo = track(new THREE.CircleGeometry(11, 64))
  const coneGeo = track(new THREE.ConeGeometry(1, 1, 5))
  coneGeo.translate(0, 0.5, 0)
  const hillGeo = track(new THREE.ConeGeometry(1.6, 1, 6))
  hillGeo.translate(0, 0.5, 0)

  const floorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x121a28,
      roughness: 0.96,
      metalness: 0.04,
    }),
  )
  const ringMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3a4d62,
      roughness: 0.7,
      metalness: 0.08,
      emissive: 0x15202c,
      emissiveIntensity: 0.4,
    }),
  )
  const beadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe4d6c0,
      roughness: 0.35,
      metalness: 0.12,
      emissive: 0x3a3024,
      emissiveIntensity: 0.25,
    }),
  )
  const railMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x8a9aab,
      roughness: 0.45,
      metalness: 0.35,
    }),
  )
  const boidMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xa8d8ee,
      roughness: 0.28,
      metalness: 0.05,
      emissive: 0x4aa0c8,
      emissiveIntensity: 0.85,
    }),
  )
  const plusMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xcfe8d4,
      roughness: 0.4,
      metalness: 0.08,
      emissive: 0x1e3a24,
      emissiveIntensity: 0.35,
    }),
  )
  const minusMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe8d0ce,
      roughness: 0.4,
      metalness: 0.08,
      emissive: 0x3a1e1c,
      emissiveIntensity: 0.35,
    }),
  )
  const addPadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd7a13a,
      roughness: 0.38,
      metalness: 0.22,
      emissive: 0x5a3a10,
      emissiveIntensity: 0.45,
    }),
  )
  const mountainMats = [
    track(
      new THREE.MeshLambertMaterial({
        color: 0x1a2a3c,
      }),
    ),
    track(
      new THREE.MeshLambertMaterial({
        color: 0x152232,
      }),
    ),
    track(
      new THREE.MeshLambertMaterial({
        color: 0x203044,
      }),
    ),
  ]

  const plusTex = track(paintGlyph('+', '#16301c'))
  const minusTex = track(paintGlyph('−', '#3a1816'))
  const addTex = track(paintGlyph('+', '#3a2a10'))
  const plusGlyphMat = track(
    new THREE.MeshBasicMaterial({
      map: plusTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  const minusGlyphMat = track(
    new THREE.MeshBasicMaterial({
      map: minusTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  const addGlyphMat = track(
    new THREE.MeshBasicMaterial({
      map: addTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  )

  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = !mobile
  scene.add(floor)

  const mountainGroup = new THREE.Group()
  mountainGroup.position.set(0, 0, -18)
  const rand = mulberry32(0x5e11)
  const peakCount = mobile ? 10 : 16
  for (let i = 0; i < peakCount; i += 1) {
    const wide = rand() > 0.55
    const mesh = new THREE.Mesh(
      wide ? hillGeo : coneGeo,
      mountainMats[i % mountainMats.length],
    )
    const x = (i / (peakCount - 1) - 0.5) * 38 + (rand() - 0.5) * 2.4
    const z = -4 - rand() * 14
    const h = 3.4 + rand() * 7.5
    const r = 1.6 + rand() * 2.4
    mesh.position.set(x, 0, z)
    mesh.scale.set(r, h, r * (0.7 + rand() * 0.5))
    mesh.rotation.y = rand() * Math.PI
    mountainGroup.add(mesh)
  }
  scene.add(mountainGroup)

  const addPad = new THREE.Mesh(addPadGeo, addPadMat)
  addPad.position.set(0, 0.1, 3.35)
  addPad.userData = { kind: 'add' }
  addPad.castShadow = !mobile
  const addGlyph = new THREE.Mesh(glyphGeo, addGlyphMat)
  addGlyph.position.set(0, 0.12, 0)
  addGlyph.raycast = () => {}
  addPad.add(addGlyph)
  scene.add(addPad)

  const rowGroup = new THREE.Group()
  scene.add(rowGroup)

  const stations = new Map<string, Station>()
  const clickable: THREE.Object3D[] = [addPad]
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const lookTarget = new THREE.Vector3(0, 1.15, 0)
  const _color = new THREE.Color()
  const _sep = new THREE.Vector3()
  const _ali = new THREE.Vector3()
  const _coh = new THREE.Vector3()
  const _steer = new THREE.Vector3()
  const _diff = new THREE.Vector3()
  const _attract = new THREE.Vector3()
  const plusPoint = new THREE.Vector3()
  let latestState: CountersSceneState = { rows: [] }
  let frameHandle = 0
  let lastTime = performance.now()
  let elapsed = 0
  let hover: THREE.Object3D | null = null

  const removeClickable = (obj: THREE.Object3D) => {
    const i = clickable.indexOf(obj)
    if (i >= 0) clickable.splice(i, 1)
  }

  const disposeStation = (station: Station) => {
    rowGroup.remove(station.group)
    removeClickable(station.plus)
    removeClickable(station.minus)
    station.numberPaint.texture.dispose()
    station.romanPaint.texture.dispose()
    const numberMat = station.numberPlane.material
    if (numberMat instanceof THREE.Material) numberMat.dispose()
    const romanMat = station.romanPlane.material
    if (romanMat instanceof THREE.Material) romanMat.dispose()
    station.balloonMat.dispose()
    station.columnMat.dispose()
    for (const boid of station.boids) {
      scene.remove(boid.mesh)
    }
  }

  const ensureStation = (id: string): Station => {
    const existing = stations.get(id)
    if (existing !== undefined) return existing

    const group = new THREE.Group()
    group.scale.setScalar(0.02)

    const columnMat = new THREE.MeshStandardMaterial({
      color: countColorInto(new THREE.Color(), 0),
      roughness: 0.55,
      metalness: 0.08,
      emissive: 0x102030,
      emissiveIntensity: 0.35,
    })
    const column = new THREE.Mesh(columnGeo, columnMat)
    column.castShadow = !mobile
    column.receiveShadow = !mobile
    column.scale.y = 0.32
    group.add(column)

    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.02
    group.add(ring)

    const plus = new THREE.Mesh(buttonGeo, plusMat)
    plus.userData = { kind: 'increment', id }
    plus.castShadow = !mobile
    const plusGlyph = new THREE.Mesh(glyphGeo, plusGlyphMat)
    plusGlyph.position.set(0, 0.02, 0.14)
    plusGlyph.raycast = () => {}
    plus.add(plusGlyph)
    group.add(plus)

    const minus = new THREE.Mesh(buttonGeo, minusMat)
    minus.userData = { kind: 'decrement', id }
    minus.castShadow = !mobile
    const minusGlyph = new THREE.Mesh(glyphGeo, minusGlyphMat)
    minusGlyph.position.set(0, 0.02, 0.14)
    minusGlyph.raycast = () => {}
    minus.add(minusGlyph)
    group.add(minus)

    const numberPaint = makePaint(512, 320)
    paintNumber(numberPaint, 0)
    const numberMat = new THREE.MeshBasicMaterial({
      map: numberPaint.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const numberPlane = new THREE.Mesh(numberGeo, numberMat)
    numberPlane.position.set(0, 1.28, 0.08)
    numberPlane.raycast = () => {}
    group.add(numberPlane)

    const romanPaint = makePaint(512, 128)
    paintRoman(romanPaint, 'N')
    const romanMat = new THREE.MeshBasicMaterial({
      map: romanPaint.texture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    })
    const romanPlane = new THREE.Mesh(romanGeo, romanMat)
    romanPlane.position.set(0, 2.02, -0.12)
    romanPlane.raycast = () => {}
    group.add(romanPlane)

    const balloonMat = new THREE.MeshStandardMaterial({
      color: 0xa8d0e8,
      roughness: 0.22,
      metalness: 0.05,
      emissive: 0x3a88b0,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    })
    const balloon = new THREE.Mesh(balloonGeo, balloonMat)
    balloon.position.set(0, 2.55, 0)
    balloon.scale.setScalar(balloonScale(0))
    balloon.raycast = () => {}
    group.add(balloon)

    const abacus = new THREE.Group()
    abacus.position.set(0, 0.48, 0.42)
    const rail0 = new THREE.Mesh(railGeo, railMat)
    rail0.position.set(0, 0, 0)
    const rail1 = new THREE.Mesh(railGeo, railMat)
    rail1.position.set(0, 0.16, 0)
    abacus.add(rail0, rail1)
    const beads: THREE.Mesh[] = []
    for (let i = 0; i < 20; i += 1) {
      const bead = new THREE.Mesh(beadGeo, beadMat)
      const rail = i < 10 ? 0 : 1
      bead.position.set(beadTargetX(i % 10, 0), rail * 0.16, 0)
      beads.push(bead)
      abacus.add(bead)
    }
    group.add(abacus)

    const boids: Boid[] = []
    for (let i = 0; i < 14; i += 1) {
      const mesh = new THREE.Mesh(boidGeo, boidMat)
      mesh.visible = false
      mesh.scale.setScalar(0)
      mesh.raycast = () => {}
      scene.add(mesh)
      boids.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        mesh,
        active: false,
        scale: 0,
      })
    }

    rowGroup.add(group)
    clickable.push(plus, minus)

    const station: Station = {
      id,
      group,
      column,
      ring,
      plus,
      minus,
      numberPlane,
      romanPlane,
      balloon,
      beads,
      numberPaint,
      romanPaint,
      balloonMat,
      columnMat,
      paintedCount: null,
      bobPhase: (id.charCodeAt(id.length - 1) || 1) * 0.73,
      appear: 0,
      boids,
    }
    stations.set(id, station)
    return station
  }

  const syncBoids = (station: Station, n: number, dt: number) => {
    const want = Math.min(Math.max(0, n), maxBoids)
    const originX = station.group.position.x
    const originY = 1.15
    const originZ = station.group.position.z

    for (let i = 0; i < station.boids.length; i += 1) {
      const boid = station.boids[i]
      const should = i < want
      if (should && !boid.active) {
        const a = Math.random() * Math.PI * 2
        const r = 0.25 + Math.random() * 0.45
        boid.pos.set(
          originX + Math.cos(a) * r,
          originY + (Math.random() - 0.3) * 0.5,
          originZ + Math.sin(a) * r * 0.7,
        )
        boid.vel.set(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.2,
        )
        boid.active = true
        boid.mesh.visible = true
      }
      if (!should && boid.active) {
        boid.active = false
      }

      const targetScale = boid.active ? 1 : 0
      boid.scale = damp(boid.scale, targetScale, 5.5, dt)
      if (boid.scale < 0.02 && !boid.active) {
        boid.mesh.visible = false
        boid.mesh.scale.setScalar(0)
        continue
      }
      boid.mesh.visible = true
      boid.mesh.scale.setScalar(boid.scale)
    }

    const live: Boid[] = []
    for (const boid of station.boids) {
      if (boid.mesh.visible && boid.scale > 0.02) live.push(boid)
    }

    const sepR = 0.28
    const aliR = 0.72
    const cohR = 0.9
    const maxSpeed = 0.62
    const maxForce = 0.11

    for (let i = 0; i < live.length; i += 1) {
      const boid = live[i]
      _sep.set(0, 0, 0)
      _ali.set(0, 0, 0)
      _coh.set(0, 0, 0)
      let sepN = 0
      let aliN = 0
      let cohN = 0
      for (let j = 0; j < live.length; j += 1) {
        if (i === j) continue
        const other = live[j]
        _diff.subVectors(boid.pos, other.pos)
        const dist = _diff.length()
        if (dist < 1e-4) continue
        if (dist < sepR) {
          _diff.multiplyScalar(1 / (dist * dist))
          _sep.add(_diff)
          sepN += 1
        }
        if (dist < aliR) {
          _ali.add(other.vel)
          aliN += 1
        }
        if (dist < cohR) {
          _coh.add(other.pos)
          cohN += 1
        }
      }
      _steer.set(0, 0, 0)
      if (sepN > 0) {
        _sep.multiplyScalar(1 / sepN)
        if (_sep.lengthSq() > 0) {
          _sep.setLength(maxSpeed).sub(boid.vel)
          if (_sep.length() > maxForce) _sep.setLength(maxForce)
          _steer.add(_sep.multiplyScalar(1.45))
        }
      }
      if (aliN > 0) {
        _ali.multiplyScalar(1 / aliN)
        _ali.setLength(maxSpeed).sub(boid.vel)
        if (_ali.length() > maxForce) _ali.setLength(maxForce)
        _steer.add(_ali.multiplyScalar(0.7))
      }
      if (cohN > 0) {
        _coh.multiplyScalar(1 / cohN).sub(boid.pos)
        if (_coh.lengthSq() > 0) {
          _coh.setLength(maxSpeed).sub(boid.vel)
          if (_coh.length() > maxForce) _coh.setLength(maxForce)
          _steer.add(_coh.multiplyScalar(0.55))
        }
      }
      _attract.set(originX, originY, originZ).sub(boid.pos)
      const attractDist = _attract.length()
      if (attractDist > 0.05) {
        _attract.multiplyScalar(0.55)
        if (attractDist > 1.6) _attract.multiplyScalar(1.8)
        _steer.add(_attract.multiplyScalar(dt * 2.2))
      }
      _steer.y += (originY - boid.pos.y) * 0.35
      boid.vel.add(_steer)
      const speed = boid.vel.length()
      if (speed > maxSpeed) boid.vel.multiplyScalar(maxSpeed / speed)
      boid.vel.multiplyScalar(0.985)
      boid.pos.addScaledVector(boid.vel, dt)
      boid.pos.y = clamp(boid.pos.y, 0.45, 2.35)
      boid.mesh.position.copy(boid.pos)
    }
  }

  const layout = (state: CountersSceneState) => {
    const count = Math.max(1, state.rows.length)
    const portrait = container.clientHeight > container.clientWidth
    const slot = portrait || mobile ? 2.05 : 2.4
    const maxSpan = portrait || mobile ? 5.2 : 8.8
    const span = Math.min(maxSpan, count * slot)
    state.rows.forEach((row, index) => {
      const station = ensureStation(row.id)
      const x = -span / 2 + (span * (index + 0.5)) / count
      station.group.position.x = x
      station.plus.position.set(0.38, 0.2, 0.88)
      station.minus.position.set(-0.38, 0.2, 0.88)
    })
    const live = new Set(state.rows.map(row => row.id))
    for (const [id, station] of stations) {
      if (!live.has(id)) {
        disposeStation(station)
        stations.delete(id)
      }
    }
  }

  const applyCountVisuals = (station: Station, n: number, dt: number) => {
    if (station.paintedCount !== n) {
      paintNumber(station.numberPaint, n)
      paintRoman(station.romanPaint, toRoman(n))
      station.paintedCount = n
    }

    const height = 0.28 + Math.min(Math.max(n, 0), 18) * 0.045
    station.column.scale.y = damp(station.column.scale.y, height, 4.2, dt)
    countColorInto(_color, n)
    station.columnMat.color.lerp(_color, 1 - Math.exp(-3.4 * dt))

    const units = Math.max(0, n) % 10
    const tens = Math.floor(Math.max(0, n) / 10) % 10
    for (let i = 0; i < 10; i += 1) {
      const bead = station.beads[i]
      const tx = beadTargetX(i, units)
      bead.position.x = damp(bead.position.x, tx, 6.2, dt)
    }
    for (let i = 0; i < 10; i += 1) {
      const bead = station.beads[10 + i]
      const tx = beadTargetX(i, tens)
      bead.position.x = damp(bead.position.x, tx, 6.2, dt)
    }

    const bScale = balloonScale(n)
    const s = damp(station.balloon.scale.x, bScale, 3.6, dt)
    station.balloon.scale.setScalar(s)
    const hue = 0.54 + Math.sin(elapsed * 0.28 + station.bobPhase) * 0.05
    station.balloonMat.color.setHSL(hue, 0.28, 0.62)
    station.balloonMat.emissive.setHSL(hue, 0.55, 0.32)
    station.balloonMat.emissiveIntensity = 0.4 + Math.min(n, 16) * 0.035
    station.balloonMat.opacity = 0.28 + Math.min(n, 12) * 0.012
  }

  const resize = () => {
    const width = container.clientWidth || 1
    const height = container.clientHeight || 1
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, isMobile() ? 1.25 : 1.75),
    )
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    const portrait = height > width
    camera.fov = portrait ? 40 : 36
    camera.updateProjectionMatrix()
  }

  const pick = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(clickable, false)
    return hits[0]?.object ?? null
  }

  const onPointerUp = (event: PointerEvent) => {
    const obj = pick(event)
    const hit = obj?.userData ?? null
    if (hit?.kind === 'increment' && typeof hit.id === 'string') {
      callbacks.onIncrement(hit.id)
    }
    if (hit?.kind === 'decrement' && typeof hit.id === 'string') {
      callbacks.onDecrement(hit.id)
    }
    if (hit?.kind === 'add') {
      callbacks.onAdd()
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const obj = pick(event)
    hover = obj
    container.style.cursor = obj ? 'pointer' : 'default'
  }

  const animate = (now: number) => {
    frameHandle = requestAnimationFrame(animate)
    const dt = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now
    elapsed += dt
    const state = latestState
    layout(state)

    const nStations = Math.max(1, state.rows.length)
    const portrait = container.clientHeight > container.clientWidth
    const extra = Math.max(0, nStations - 2)
    camBase.set(
      0,
      portrait ? 4.35 : 3.55,
      (portrait ? 11.4 : 9.2) + extra * (portrait ? 1.15 : 0.75),
    )
    camera.position.x = damp(
      camera.position.x,
      camBase.x + Math.sin(elapsed * 0.07) * 0.14,
      2.4,
      dt,
    )
    camera.position.y = damp(
      camera.position.y,
      camBase.y + Math.sin(elapsed * 0.05) * 0.07,
      2.4,
      dt,
    )
    camera.position.z = damp(camera.position.z, camBase.z, 2.2, dt)
    camera.lookAt(lookTarget)

    let total = 0
    state.rows.forEach(row => {
      total += Math.max(0, row.count)
      const station = stations.get(row.id)
      if (station === undefined) return
      station.appear = damp(station.appear, 1, 4.8, dt)
      station.group.scale.setScalar(Math.max(0.02, station.appear))
      applyCountVisuals(station, row.count, dt)
      const bob = Math.sin(elapsed * 0.7 + station.bobPhase) * 0.07
      station.balloon.position.y = 2.48 + bob
      station.balloon.rotation.y = elapsed * 0.18 + station.bobPhase
      station.romanPlane.position.y =
        2.02 + Math.sin(elapsed * 0.45 + station.bobPhase) * 0.035
      station.numberPlane.quaternion.copy(camera.quaternion)
      station.romanPlane.quaternion.copy(camera.quaternion)
      station.plus.children[0]?.quaternion.copy(camera.quaternion)
      station.minus.children[0]?.quaternion.copy(camera.quaternion)
      const pressPlus = hover === station.plus ? 1.1 : 1
      const pressMinus = hover === station.minus ? 1.1 : 1
      station.plus.scale.setScalar(
        damp(station.plus.scale.x, pressPlus, 10, dt),
      )
      station.minus.scale.setScalar(
        damp(station.minus.scale.x, pressMinus, 10, dt),
      )
      syncBoids(station, row.count, dt)
    })

    const fogTarget = 0.026 + Math.min(total, 40) * 0.00018
    fog.density = damp(fog.density, fogTarget, 1.2, dt)
    const peakH = 1 + Math.min(total, 50) * 0.006
    mountainGroup.scale.y = damp(mountainGroup.scale.y, peakH, 0.8, dt)

    addPad.position.y = 0.1 + Math.sin(elapsed * 1.15) * 0.018
    addGlyph.quaternion.copy(camera.quaternion)
    const addScale = hover === addPad ? 1.08 : 1
    addPad.scale.setScalar(damp(addPad.scale.x, addScale, 10, dt))
    addPadMat.emissiveIntensity = 0.4 + Math.sin(elapsed * 1.6) * 0.12

    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    for (const [id, station] of stations) {
      station.plus.getWorldPosition(plusPoint)
      plusPoint.project(camera)
      const clientX = rect.left + ((plusPoint.x + 1) / 2) * rect.width
      const clientY = rect.top + ((1 - plusPoint.y) / 2) * rect.height
      if (id === 'counter-1') {
        canvas.dataset.incrementCounter1X = clientX.toFixed(1)
        canvas.dataset.incrementCounter1Y = clientY.toFixed(1)
      }
    }

    renderer.render(scene, camera)
  }

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(container)
  resize()
  container.addEventListener('pointerup', onPointerUp)
  container.addEventListener('pointermove', onPointerMove)
  frameHandle = requestAnimationFrame(animate)

  return {
    syncState(state: CountersSceneState) {
      latestState = state
    },
    dispose() {
      cancelAnimationFrame(frameHandle)
      resizeObserver.disconnect()
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointermove', onPointerMove)
      for (const station of stations.values()) {
        disposeStation(station)
      }
      stations.clear()
      for (const obj of disposables) obj.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
