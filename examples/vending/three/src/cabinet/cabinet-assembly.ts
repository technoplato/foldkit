import * as THREE from 'three'
import type { ClipLine } from 'vending-core-example'

import { type Iphone17Pro, createIphone17Pro } from '../phone/iphone-17-pro.js'
import type {
  ThreeCanvasTexture,
  ThreeGroup,
  ThreeMesh,
  ThreeObject3D,
  ThreeTexture,
  ThreeVector3,
} from '../three-compat.js'
import {
  compileStaticGeometry,
  createGlassFrameGeometry,
  placementBoxGeometry,
} from './cabinet-geometry.js'
import {
  type CabinetMaterials,
  createCabinetMaterials,
} from './cabinet-materials.js'
import {
  type CabinetPlan,
  createCabinetPlan,
  placementOf,
} from './cabinet-plan.js'
import {
  clipFallSeconds,
  clipShelfIndex,
  columnLeft,
  doorBottom,
  doorOpenRadians,
  frontZ,
  keypadBottom,
  keypadTop,
  shelfHeights,
} from './design-contract.js'
import {
  createBrandTexture,
  createKeyTexture,
  createLedTexture,
  createPriceTexture,
  createSlotTexture,
} from './face-textures.js'
import type { TriangleReport } from './mesh-writer.js'

export type KeyKind = 'digit' | 'enter' | 'clear'

export type KeySpec = Readonly<{
  label: string
  kind: KeyKind
  digit?: string
}>

export type KeypadButton = Readonly<{
  spec: KeySpec
  mesh: ThreeMesh
  restZ: number
}>

const keypadSpecs: ReadonlyArray<KeySpec> = [
  { label: '1', kind: 'digit', digit: '1' },
  { label: '2', kind: 'digit', digit: '2' },
  { label: '3', kind: 'digit', digit: '3' },
  { label: '4', kind: 'digit', digit: '4' },
  { label: '5', kind: 'digit', digit: '5' },
  { label: '6', kind: 'digit', digit: '6' },
  { label: '7', kind: 'digit', digit: '7' },
  { label: '8', kind: 'digit', digit: '8' },
  { label: '9', kind: 'digit', digit: '9' },
  { label: 'CLR', kind: 'clear' },
  { label: '0', kind: 'digit', digit: '0' },
  { label: 'ENT', kind: 'enter' },
]

const slotLabels: ReadonlyArray<string> = ['A4', 'A3', 'A2', 'A1']

export type CabinetAssembly = Readonly<{
  plan: CabinetPlan
  root: ThreeGroup
  doorPivot: ThreeGroup
  clip: ThreeGroup
  phone: Iphone17Pro
  clipShelf: ThreeVector3
  clipBin: ThreeVector3
  clipPresent: ThreeVector3
  buttons: ReadonlyArray<KeypadButton>
  clickable: ReadonlyArray<ThreeObject3D>
  bloomMeshes: ReadonlyArray<ThreeMesh>
  ledDisplay: ThreeMesh
  ledBloom: ThreeMesh
  ledStrips: ReadonlyArray<ThreeMesh>
  jewel: ThreeMesh
  qrPanel: ThreeMesh
  glass: ThreeMesh
  staticMeshes: ReadonlyArray<ThreeMesh>
  materials: CabinetMaterials
  reports: ReadonlyArray<TriangleReport>
  extraTriangles: number
  dispose: () => void
  setLedTexture: (texture: ThreeCanvasTexture) => void
  setKeyFeedback: (label: string | undefined) => void
  setQrTexture: (texture: ThreeTexture | undefined) => void
  setBrandTexture: (texture: ThreeCanvasTexture) => void
  setPriceTexture: (texture: ThreeCanvasTexture) => void
  paintClipScreen: (lines: ReadonlyArray<ClipLine>, locked: boolean) => void
}>

const enableShadow = (mesh: ThreeMesh, cast: boolean): void => {
  mesh.castShadow = cast
  mesh.receiveShadow = true
}

/** Builds the semantic cabinet hierarchy from the plan. */
export const createCabinetAssembly = (): CabinetAssembly => {
  const plan = createCabinetPlan()
  const materials = createCabinetMaterials()
  const compiled = compileStaticGeometry(plan)
  const root = new THREE.Group()
  root.name = 'vending-machine'
  const staticMeshes: Array<ThreeMesh> = []
  const bloomMeshes: Array<ThreeMesh> = []
  const textures: Array<ThreeTexture> = []
  let extraTriangles = 0

  for (const [slot, geometry] of compiled.geometries) {
    const material =
      slot === 'paintedSteel'
        ? materials.paintedSteel
        : slot === 'chrome'
          ? materials.chrome
          : slot === 'interior'
            ? materials.interior
            : slot === 'rubber'
              ? materials.rubber
              : materials.booth
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `slot-${slot}`
    enableShadow(mesh, slot !== 'booth')
    root.add(mesh)
    staticMeshes.push(mesh)
  }

  const glassPlacement = placementOf(plan, 'Glass')
  const glass = new THREE.Mesh(
    placementBoxGeometry(glassPlacement),
    materials.glass,
  )
  glass.position.set(
    glassPlacement.center.x,
    glassPlacement.center.y,
    glassPlacement.center.z,
  )
  glass.name = 'glass'
  extraTriangles += 12
  root.add(glass)

  const frame = new THREE.Mesh(createGlassFrameGeometry(), materials.chrome)
  frame.name = 'glass-frame'
  frame.castShadow = true
  extraTriangles += Math.floor((frame.geometry.getIndex()?.count ?? 0) / 3)
  root.add(frame)

  const doorPlacement = placementOf(plan, 'Door')
  const doorPivot = new THREE.Group()
  doorPivot.position.set(doorPlacement.center.x, doorBottom, frontZ + 0.002)
  doorPivot.name = 'door-pivot'
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(
      doorPlacement.size.x,
      doorPlacement.size.y,
      doorPlacement.size.z,
    ),
    materials.paintedSteel,
  )
  door.position.set(0, doorPlacement.size.y / 2, 0)
  door.name = 'door'
  enableShadow(door, true)
  extraTriangles += 12
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.09, 16),
    materials.chrome,
  )
  handle.rotation.z = Math.PI / 2
  handle.position.set(
    0,
    doorPlacement.size.y * 0.62,
    doorPlacement.size.z / 2 + 0.01,
  )
  extraTriangles += 32
  doorPivot.add(door)
  doorPivot.add(handle)
  root.add(doorPivot)

  const ledPlacement = placementOf(plan, 'LedDisplay')
  const ledTexture = createLedTexture('', 'Idle')
  textures.push(ledTexture)
  const ledDisplay = new THREE.Mesh(
    new THREE.PlaneGeometry(ledPlacement.size.x, ledPlacement.size.y),
    materials.ledPanel,
  )
  materials.ledPanel.map = ledTexture
  materials.ledPanel.emissiveMap = ledTexture
  ledDisplay.position.set(
    ledPlacement.center.x,
    ledPlacement.center.y,
    ledPlacement.center.z + 0.004,
  )
  ledDisplay.name = 'led-display'
  extraTriangles += 2
  root.add(ledDisplay)
  const ledBloom = new THREE.Mesh(
    new THREE.PlaneGeometry(ledPlacement.size.x, ledPlacement.size.y),
    materials.ledBloom,
  )
  ledBloom.position.copy(ledDisplay.position)
  ledBloom.position.z -= 0.004
  ledBloom.scale.set(1.08, 1.12, 1)
  ledBloom.userData['bloom'] = true
  extraTriangles += 2
  root.add(ledBloom)
  bloomMeshes.push(ledBloom)

  const stripPlacements = plan.placements.filter(
    item => item.kind === 'LedStrip',
  )
  const ledStrips = stripPlacements.map(placement => {
    const strip = new THREE.Mesh(
      placementBoxGeometry(placement),
      materials.ledBloom,
    )
    strip.position.set(
      placement.center.x,
      placement.center.y,
      placement.center.z,
    )
    strip.userData['bloom'] = true
    strip.name = placement.id
    extraTriangles += 12
    root.add(strip)
    bloomMeshes.push(strip)
    return strip
  })

  const jewelPlacement = placementOf(plan, 'Jewel')
  const jewel = new THREE.Mesh(
    new THREE.SphereGeometry(jewelPlacement.size.x / 2, 16, 12),
    materials.jewel,
  )
  jewel.position.set(
    jewelPlacement.center.x,
    jewelPlacement.center.y,
    jewelPlacement.center.z,
  )
  jewel.userData['bloom'] = true
  extraTriangles += 16 * 12 * 2
  root.add(jewel)
  bloomMeshes.push(jewel)

  const brandPlacement = placementOf(plan, 'Brand')
  const brandTexture = createBrandTexture()
  textures.push(brandTexture)
  materials.brand.map = brandTexture
  const brand = new THREE.Mesh(
    new THREE.PlaneGeometry(brandPlacement.size.x, brandPlacement.size.y),
    materials.brand,
  )
  brand.position.set(
    brandPlacement.center.x,
    brandPlacement.center.y,
    brandPlacement.center.z,
  )
  extraTriangles += 2
  root.add(brand)

  const pricePlacement = placementOf(plan, 'PricePlate')
  const priceTexture = createPriceTexture('14.28')
  textures.push(priceTexture)
  materials.price.map = priceTexture
  const price = new THREE.Mesh(
    new THREE.PlaneGeometry(pricePlacement.size.x, pricePlacement.size.y),
    materials.price,
  )
  price.position.set(
    pricePlacement.center.x,
    pricePlacement.center.y,
    pricePlacement.center.z,
  )
  extraTriangles += 2
  root.add(price)

  const qrPlacement = placementOf(plan, 'QrPanel')
  const qrPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(qrPlacement.size.x, qrPlacement.size.y),
    materials.qr,
  )
  qrPanel.position.set(
    qrPlacement.center.x,
    qrPlacement.center.y,
    qrPlacement.center.z,
  )
  qrPanel.visible = false
  extraTriangles += 2
  root.add(qrPanel)

  const keypadPlacement = placementOf(plan, 'Keypad')
  const buttons: Array<KeypadButton> = []
  const clickable: Array<ThreeObject3D> = []
  const keyGeometry = new THREE.BoxGeometry(
    keypadPlacement.size.x / 3.15,
    keypadPlacement.size.y / 4.55,
    0.024,
  )
  extraTriangles += 12
  for (const [index, spec] of keypadSpecs.entries()) {
    const column = index % 3
    const row = Math.floor(index / 3)
    const texture = createKeyTexture(spec.label)
    textures.push(texture)
    const material = materials.rubber.clone()
    material.map = texture
    material.emissiveMap = texture
    material.emissive.set(0x8a7048)
    material.emissiveIntensity = 0.28
    const mesh = new THREE.Mesh(keyGeometry, material)
    const x =
      keypadPlacement.center.x -
      keypadPlacement.size.x * 0.32 +
      column * (keypadPlacement.size.x * 0.32)
    const y = keypadTop - 0.05 - row * ((keypadTop - keypadBottom) / 4.15)
    const restZ = frontZ + 0.022
    mesh.position.set(x, y, restZ)
    mesh.userData['spec'] = spec
    mesh.name = `key-${spec.label}`
    enableShadow(mesh, true)
    root.add(mesh)
    buttons.push({ spec, mesh, restZ })
    clickable.push(mesh)
  }

  for (const [index, shelfY] of shelfHeights.entries()) {
    const label = slotLabels.at(shelfHeights.length - 1 - index)
    if (label === undefined) {
      continue
    }
    const texture = createSlotTexture(label)
    textures.push(texture)
    const caption = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.032),
      new THREE.MeshBasicMaterial({ map: texture }),
    )
    caption.position.set(columnLeft - 0.05, shelfY + 0.03, frontZ - 0.08)
    extraTriangles += 2
    root.add(caption)
  }

  const clip = new THREE.Group()
  clip.name = 'clip'
  const phone = createIphone17Pro()
  extraTriangles += phone.triangleCount
  clip.add(phone.root)
  bloomMeshes.push(...phone.bloomMeshes)
  const clipShelfY = shelfHeights.at(clipShelfIndex) ?? 1.08
  const clipShelf = new THREE.Vector3(-0.16, clipShelfY + 0.078, 0.02)
  const clipBin = new THREE.Vector3(
    doorPlacement.center.x,
    doorBottom + 0.09,
    frontZ - 0.14,
  )
  const clipPresent = new THREE.Vector3(0.08, 0.9, 0.82)
  clip.position.copy(clipShelf)
  root.add(clip)

  const setLedTexture = (texture: ThreeCanvasTexture): void => {
    const previous = materials.ledPanel.map
    if (previous instanceof THREE.Texture) {
      previous.dispose()
    }
    texture.needsUpdate = true
    materials.ledPanel.map = texture
    materials.ledPanel.emissiveMap = texture
    materials.ledPanel.needsUpdate = true
  }

  const setKeyFeedback = (label: string | undefined): void => {
    for (const button of buttons) {
      const material = button.mesh.material
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        continue
      }
      const isLit = label === button.spec.label
      material.emissive.setHex(isLit ? 0xffe7a8 : 0x8a7048)
      material.emissiveIntensity = isLit ? 1.85 : 0.28
    }
  }

  const setQrTexture = (texture: ThreeTexture | undefined): void => {
    const previous = materials.qr.map
    if (previous instanceof THREE.Texture) {
      previous.dispose()
    }
    materials.qr.map = texture ?? null
    materials.qr.needsUpdate = true
    qrPanel.visible = texture !== undefined
  }

  const setBrandTexture = (texture: ThreeCanvasTexture): void => {
    materials.brand.map = texture
    materials.brand.needsUpdate = true
  }

  const setPriceTexture = (texture: ThreeCanvasTexture): void => {
    const previous = materials.price.map
    if (previous instanceof THREE.Texture) {
      previous.dispose()
    }
    materials.price.map = texture
    materials.price.needsUpdate = true
  }

  return {
    plan,
    root,
    doorPivot,
    clip,
    phone,
    clipShelf,
    clipBin,
    clipPresent,
    buttons,
    clickable,
    bloomMeshes,
    ledDisplay,
    ledBloom,
    ledStrips,
    jewel,
    qrPanel,
    glass,
    staticMeshes,
    materials,
    reports: compiled.reports,
    extraTriangles,
    dispose: () => {
      for (const mesh of staticMeshes) {
        mesh.geometry.dispose()
      }
      frame.geometry.dispose()
      glass.geometry.dispose()
      door.geometry.dispose()
      handle.geometry.dispose()
      keyGeometry.dispose()
      for (const texture of textures) {
        texture.dispose()
      }
      materials.dispose()
      phone.dispose()
    },
    setLedTexture,
    setKeyFeedback,
    setQrTexture,
    setBrandTexture,
    setPriceTexture,
    paintClipScreen: (lines, locked) => {
      phone.screen.paint(lines, locked)
    },
  }
}

export { doorOpenRadians, clipFallSeconds }
