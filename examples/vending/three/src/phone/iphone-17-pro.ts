import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

import type {
  ThreeBufferGeometry,
  ThreeGroup,
  ThreeMaterial,
  ThreeMesh,
} from '../three-compat.js'
import {
  actionButtonLength,
  buttonProtrusion,
  ceramicShield,
  cosmicOrange,
  displayHeight,
  displayWidth,
  islandCenterY,
  islandHeight,
  islandWidth,
  lensGlassRadius,
  lensRadius,
  phoneCornerRadius,
  phoneDepth,
  phoneHeight,
  phoneWidth,
  plateauCenterY,
  plateauDepth,
  plateauHeight,
  plateauWidth,
  volumeButtonLength,
} from './iphone-contract.js'
import { type MessagesScreen, createMessagesScreen } from './messages-screen.js'

export type Iphone17Pro = Readonly<{
  root: ThreeGroup
  screen: MessagesScreen
  bloomMeshes: ReadonlyArray<ThreeMesh>
  triangleCount: number
  dispose: () => void
}>

const trianglesOf = (mesh: ThreeMesh): number => {
  const index = mesh.geometry.getIndex()
  if (index !== null) {
    return Math.floor(index.count / 3)
  }
  const position = mesh.geometry.getAttribute('position')
  return Math.floor((position?.count ?? 0) / 3)
}

const enableShadow = (mesh: ThreeMesh): void => {
  mesh.castShadow = true
  mesh.receiveShadow = true
}

/** Cosmic Orange iPhone 17 Pro. Dimensions from the 2025 spec. */
export const createIphone17Pro = (): Iphone17Pro => {
  const root = new THREE.Group()
  root.name = 'iphone-17-pro'
  const geometries: Array<ThreeBufferGeometry> = []
  const materials: Array<ThreeMaterial> = []
  const bloomMeshes: Array<ThreeMesh> = []
  let triangleCount = 0

  const add = (mesh: ThreeMesh, bloom = false): void => {
    enableShadow(mesh)
    geometries.push(mesh.geometry)
    triangleCount += trianglesOf(mesh)
    root.add(mesh)
    if (bloom) {
      mesh.userData['bloom'] = true
      bloomMeshes.push(mesh)
    }
  }

  const aluminum = new THREE.MeshPhysicalMaterial({
    color: cosmicOrange,
    metalness: 0.86,
    roughness: 0.28,
    clearcoat: 0.22,
    clearcoatRoughness: 0.38,
    envMapIntensity: 1.05,
  })
  const blackGlass = new THREE.MeshPhysicalMaterial({
    color: ceramicShield,
    metalness: 0.18,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.15,
  })
  const frontGlass = new THREE.MeshPhysicalMaterial({
    color: 0xdfe8f4,
    metalness: 0,
    roughness: 0.02,
    transmission: 0.86,
    thickness: 0.0006,
    ior: 1.51,
    transparent: true,
    opacity: 0.22,
    envMapIntensity: 1.2,
  })
  const lensRing = new THREE.MeshPhysicalMaterial({
    color: 0x1a1c20,
    metalness: 0.72,
    roughness: 0.22,
    envMapIntensity: 1,
  })
  const lensGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0b1a28,
    metalness: 0.4,
    roughness: 0.04,
    transmission: 0.35,
    thickness: 0.002,
    ior: 1.6,
    transparent: true,
    envMapIntensity: 1.3,
  })
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd7dde4,
    metalness: 0.94,
    roughness: 0.14,
  })
  materials.push(aluminum, blackGlass, frontGlass, lensRing, lensGlass, chrome)

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(
      phoneWidth,
      phoneHeight,
      phoneDepth,
      8,
      phoneCornerRadius,
    ),
    aluminum,
  )
  body.name = 'unibody'
  add(body)

  const backGlass = new THREE.Mesh(
    new RoundedBoxGeometry(
      phoneWidth - 0.0016,
      phoneHeight - 0.0016,
      0.0007,
      6,
      phoneCornerRadius - 0.001,
    ),
    blackGlass,
  )
  backGlass.position.z = -phoneDepth / 2 - 0.0002
  backGlass.name = 'back-glass'
  add(backGlass)

  const plateau = new THREE.Mesh(
    new RoundedBoxGeometry(plateauWidth, plateauHeight, plateauDepth, 6, 0.006),
    aluminum,
  )
  plateau.position.set(0, plateauCenterY, -phoneDepth / 2 - plateauDepth / 2)
  plateau.name = 'camera-plateau'
  add(plateau)

  const lensCenters: ReadonlyArray<readonly [number, number]> = [
    [-0.0165, plateauCenterY + 0.009],
    [-0.0165, plateauCenterY - 0.009],
    [0.0015, plateauCenterY],
  ]
  for (const [index, [x, y]] of lensCenters.entries()) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(
        lensRadius,
        lensRadius,
        plateauDepth + 0.0016,
        32,
      ),
      lensRing,
    )
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(x, y, -phoneDepth / 2 - plateauDepth / 2)
    barrel.name = `lens-barrel-${String(index)}`
    add(barrel)
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(lensGlassRadius, 32),
      lensGlass,
    )
    glass.position.set(x, y, -phoneDepth / 2 - plateauDepth - 0.0004)
    glass.rotation.y = Math.PI
    glass.name = `lens-glass-${String(index)}`
    add(glass)
  }

  const flash = new THREE.Mesh(
    new THREE.CircleGeometry(0.0032, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false }),
  )
  flash.position.set(
    0.022,
    plateauCenterY + 0.006,
    -phoneDepth / 2 - plateauDepth - 0.0002,
  )
  flash.rotation.y = Math.PI
  flash.userData['bloom'] = true
  materials.push(flash.material)
  add(flash, true)

  const screen = createMessagesScreen()
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(displayWidth, displayHeight),
    new THREE.MeshBasicMaterial({
      map: screen.texture,
      toneMapped: false,
    }),
  )
  display.position.z = phoneDepth / 2 + 0.00015
  display.name = 'oled'
  add(display)

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(displayWidth + 0.0012, displayHeight + 0.0012),
    frontGlass,
  )
  glass.position.z = phoneDepth / 2 + 0.0004
  glass.name = 'front-glass'
  add(glass)

  const island = new THREE.Mesh(
    new RoundedBoxGeometry(
      islandWidth,
      islandHeight,
      0.0005,
      4,
      islandHeight / 2,
    ),
    new THREE.MeshBasicMaterial({ color: 0x050505 }),
  )
  island.position.set(0, islandCenterY, phoneDepth / 2 + 0.00035)
  materials.push(island.material)
  add(island)

  const side = (y: number, length: number, x: number): ThreeMesh => {
    const button = new THREE.Mesh(
      new RoundedBoxGeometry(buttonProtrusion, length, 0.0032, 2, 0.0008),
      aluminum,
    )
    button.position.set(x, y, 0)
    add(button)
    return button
  }
  side(0.028, volumeButtonLength, -phoneWidth / 2 - buttonProtrusion / 2)
  side(0.006, volumeButtonLength, -phoneWidth / 2 - buttonProtrusion / 2)
  side(0.018, actionButtonLength, phoneWidth / 2 + buttonProtrusion / 2)

  const mute = new THREE.Mesh(
    new THREE.BoxGeometry(0.0014, 0.006, 0.0024),
    chrome,
  )
  mute.position.set(-phoneWidth / 2 - 0.0006, 0.048, 0)
  add(mute)

  return {
    root,
    screen,
    bloomMeshes,
    triangleCount,
    dispose: () => {
      screen.dispose()
      for (const geometry of geometries) {
        geometry.dispose()
      }
      for (const material of materials) {
        material.dispose()
      }
    },
  }
}

export type { MessagesScreen }
