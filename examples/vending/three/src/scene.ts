import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { ClipLine } from 'vending-core-example'

import { createMachineMotion } from './animation/machine-motion.js'
import {
  type KeySpec,
  createCabinetAssembly,
} from './cabinet/cabinet-assembly.js'
import {
  type ViewMode,
  viewModeFromLocation,
} from './cabinet/design-contract.js'
import {
  createLedTexture,
  createPriceTexture,
} from './cabinet/face-textures.js'
import { createMachineCamera } from './camera/machine-camera.js'
import { createImagePipeline } from './image/image-pipeline.js'
import { createMachineLights } from './lighting/machine-shadows.js'
import type { ThreeMaterial, ThreeMesh, ThreeObject3D } from './three-compat.js'

export type VendingSceneState = Readonly<{
  digits: string
  lastControl: string | undefined
  skuLabel: string
  listPriceDisplay: string
  vendPhase: string
  address: string | undefined
  clipboard: string
  copyLabel: string
  qrDataUrl: string | undefined
  incomingCount: number
  clipPlayback: string
  clipLines: ReadonlyArray<ClipLine>
}>

export type VendingSceneCallbacks = Readonly<{
  onDigit: (digit: string) => void
  onEnter: () => void
  onClear: () => void
}>

const applyViewMaterials = (
  root: ThreeObject3D,
  viewMode: ViewMode,
): (() => void) => {
  if (viewMode !== 'topology' && viewMode !== 'materials') {
    return () => undefined
  }
  const restorations: Array<{
    mesh: ThreeMesh
    material: ThreeMaterial | Array<ThreeMaterial>
  }> = []
  root.traverse((object: ThreeObject3D) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    restorations.push({ mesh: object, material: object.material })
    if (viewMode === 'topology') {
      object.material = new THREE.MeshBasicMaterial({
        color: 0xf6d59a,
        wireframe: true,
      })
      return
    }
    object.material = new THREE.MeshBasicMaterial({
      color: 0xb08a78,
    })
  })
  return () => {
    for (const item of restorations) {
      const current = item.mesh.material
      item.mesh.material = item.material
      if (current instanceof THREE.Material && current !== item.material) {
        current.dispose()
      }
    }
  }
}

/** Host-owned vending machine. Core owns vend rules. This only renders. */
export const createVendingScene = (
  container: HTMLElement,
  callbacks: VendingSceneCallbacks,
) => {
  const viewMode = viewModeFromLocation(window.location.search)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0c0a09)
  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(room, 0.04).texture
  scene.environmentIntensity = 0.48
  room.dispose()
  pmrem.dispose()

  const assembly = createCabinetAssembly()
  scene.add(assembly.root)
  const cameraRig = createMachineCamera()
  const lights = createMachineLights(scene)
  lights.updateFit(cameraRig.camera)
  const pipeline = createImagePipeline(
    renderer,
    scene,
    cameraRig.camera,
    assembly.bloomMeshes,
    viewMode,
  )
  const restoreView = applyViewMaterials(scene, viewMode)
  const motion = createMachineMotion(assembly)

  let latestState: VendingSceneState = {
    digits: '',
    lastControl: undefined,
    skuLabel: '',
    listPriceDisplay: '14.28',
    vendPhase: 'Idle',
    address: undefined,
    clipboard: 'idle',
    copyLabel: 'Copy Solana Pay',
    qrDataUrl: undefined,
    incomingCount: 0,
    clipPlayback: 'Idle',
    clipLines: [],
  }
  let paintedDigits = ''
  let paintedPhase = ''
  let paintedControl: string | undefined
  let paintedPrice = '14.28'
  let paintedClipKey = ''
  let lastQrUrl: string | undefined
  let frameHandle = 0
  let lastTime = performance.now()
  let elapsedSeconds = 0
  let heroLatched = false
  const pointer = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const tapTravelLimit = 32
  let pointerDownX = 0
  let pointerDownY = 0
  let isPointerDown = false
  let pressedSpec: KeySpec | undefined

  const resize = (): void => {
    const width = container.clientWidth || 1
    const height = container.clientHeight || 1
    pipeline.setSize(width, height)
    cameraRig.setSize(width, height)
  }

  const specFromObject = (object: ThreeObject3D): KeySpec | undefined => {
    let current: ThreeObject3D | null = object
    while (current !== null) {
      const spec = current.userData['spec']
      if (spec !== undefined) {
        return spec as KeySpec
      }
      current = current.parent
    }
    return undefined
  }

  const pickSpec = (event: PointerEvent): KeySpec | undefined => {
    const rect = container.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, cameraRig.camera)
    const hits = raycaster.intersectObjects(assembly.clickable, true)
    const first = hits.at(0)
    if (first === undefined) {
      return undefined
    }
    return specFromObject(first.object)
  }

  const emitSpec = (spec: KeySpec): void => {
    if (spec.kind === 'digit' && spec.digit !== undefined) {
      callbacks.onDigit(spec.digit)
      return
    }
    if (spec.kind === 'enter') {
      callbacks.onEnter()
      return
    }
    callbacks.onClear()
  }

  const onPointerDown = (event: PointerEvent): void => {
    isPointerDown = true
    pointerDownX = event.clientX
    pointerDownY = event.clientY
    pressedSpec = pickSpec(event)
    if (pressedSpec !== undefined) {
      motion.notePress(pressedSpec.label)
    }
    container.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!isPointerDown || pressedSpec !== undefined) {
      return
    }
    const travel = Math.hypot(
      event.clientX - pointerDownX,
      event.clientY - pointerDownY,
    )
    if (travel < tapTravelLimit) {
      return
    }
    cameraRig.orbitBy(event.movementX * 0.55, event.movementY * 0.55)
  }

  const onPointerUp = (event: PointerEvent): void => {
    const spec = pickSpec(event) ?? pressedSpec
    const travel = Math.hypot(
      event.clientX - pointerDownX,
      event.clientY - pointerDownY,
    )
    if (spec !== undefined && travel < tapTravelLimit) {
      emitSpec(spec)
    }
    motion.releasePress()
    isPointerDown = false
    pressedSpec = undefined
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    cameraRig.dollyBy(event.deltaY * 0.004)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key >= '0' && event.key <= '9') {
      motion.notePress(event.key)
      callbacks.onDigit(event.key)
      return
    }
    if (event.key === 'Enter') {
      motion.notePress('ENT')
      callbacks.onEnter()
      return
    }
    if (
      event.key === 'Backspace' ||
      event.key === 'Escape' ||
      event.key === 'c'
    ) {
      motion.notePress('CLR')
      callbacks.onClear()
    }
  }

  const onKeyUp = (): void => {
    motion.releasePress()
  }

  const refreshDisplay = (state: VendingSceneState): void => {
    if (state.digits !== paintedDigits || state.vendPhase !== paintedPhase) {
      assembly.setLedTexture(createLedTexture(state.digits, state.vendPhase))
      paintedDigits = state.digits
      paintedPhase = state.vendPhase
    }
    if (state.lastControl !== paintedControl) {
      assembly.setKeyFeedback(state.lastControl)
      paintedControl = state.lastControl
    }
    if (state.listPriceDisplay !== paintedPrice) {
      assembly.setPriceTexture(createPriceTexture(state.listPriceDisplay))
      paintedPrice = state.listPriceDisplay
    }
  }

  const refreshClip = (state: VendingSceneState): void => {
    const locked = state.clipPlayback === 'Idle'
    const key = `${state.clipPlayback}:${String(state.clipLines.length)}`
    if (key === paintedClipKey) {
      return
    }
    paintedClipKey = key
    assembly.paintClipScreen(state.clipLines, locked)
  }

  const refreshQr = (state: VendingSceneState): void => {
    if (state.qrDataUrl === lastQrUrl) {
      assembly.qrPanel.visible = state.qrDataUrl !== undefined
      return
    }
    lastQrUrl = state.qrDataUrl
    if (state.qrDataUrl === undefined) {
      assembly.setQrTexture(undefined)
      return
    }
    const image = new Image()
    image.onload = () => {
      const texture = new THREE.Texture(image)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.needsUpdate = true
      assembly.setQrTexture(texture)
    }
    image.src = state.qrDataUrl
  }

  const animate = (now: number): void => {
    const deltaSeconds = (now - lastTime) / 1000
    lastTime = now
    elapsedSeconds += deltaSeconds
    const state = latestState
    refreshDisplay(state)
    refreshClip(state)
    refreshQr(state)
    cameraRig.update(deltaSeconds)
    const doorMoved = motion.update(
      state.vendPhase,
      state.lastControl,
      deltaSeconds,
      elapsedSeconds,
    )
    if (motion.presented() && !heroLatched) {
      heroLatched = true
      cameraRig.setShot('phone-hero', assembly.clipPresent)
      lights.invalidate()
    }
    if (state.vendPhase === 'Idle' && heroLatched) {
      heroLatched = false
      cameraRig.setShot('machine')
      lights.invalidate()
    }
    if (doorMoved) {
      lights.invalidate()
    }
    pipeline.render(deltaSeconds)
    frameHandle = requestAnimationFrame(animate)
  }

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(container)
  resize()
  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('pointermove', onPointerMove)
  container.addEventListener('pointerup', onPointerUp)
  container.addEventListener('pointercancel', onPointerUp)
  container.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  frameHandle = requestAnimationFrame(animate)

  const reports = [
    ...assembly.reports,
    { part: 'live', slot: 'mixed', triangles: assembly.extraTriangles },
  ]
  console.info('vending cabinet', {
    viewMode,
    seed: assembly.plan.seed,
    masses: assembly.plan.diagnostics.massCount,
    placements: assembly.plan.diagnostics.placementCount,
    triangles: reports.reduce((sum, item) => sum + item.triangles, 0),
    camera: cameraRig.contract,
  })

  return {
    syncState(state: VendingSceneState) {
      latestState = state
    },
    viewMode,
    dispose() {
      cancelAnimationFrame(frameHandle)
      resizeObserver.disconnect()
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
      container.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      restoreView()
      pipeline.dispose()
      lights.dispose()
      cameraRig.restore()
      assembly.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
