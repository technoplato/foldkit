import * as THREE from 'three'
import { Array, Option } from 'effect'
import { gridCoord } from 'foldkit/spatial'
import { lastCell, signCells, signs, vendingAt } from 'world-core-example'

import { cellSize, worldFromCell } from './layout.js'
import type { ThreeGroup } from './three-compat.js'

const grass = new THREE.MeshStandardMaterial({
  color: 0x3f6b3a,
  roughness: 0.92,
  metalness: 0.02,
})
const dirt = new THREE.MeshStandardMaterial({
  color: 0x6b5340,
  roughness: 0.95,
  metalness: 0.01,
})
const wood = new THREE.MeshStandardMaterial({
  color: 0x7a5130,
  roughness: 0.78,
  metalness: 0.04,
})
const board = new THREE.MeshStandardMaterial({
  color: 0xc4a36a,
  roughness: 0.7,
  metalness: 0.05,
  emissive: 0x22180c,
  emissiveIntensity: 0.15,
})

const makeSignTexture = (label: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context === null) {
    return new THREE.CanvasTexture(canvas)
  }
  context.fillStyle = '#c4a36a'
  context.fillRect(0, 0, 256, 128)
  context.fillStyle = '#2a1c10'
  context.font = 'bold 28px serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, 128, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const addFencePost = (group: ThreeGroup, x: number, z: number): void => {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), wood)
  post.position.set(x, 0.57, z)
  post.castShadow = true
  post.receiveShadow = true
  group.add(post)
}

const addRail = (
  group: ThreeGroup,
  x: number,
  z: number,
  width: number,
  depth: number,
): void => {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), wood)
  rail.position.set(x, 0.72, z)
  rail.castShadow = true
  group.add(rail)
}

/** Builds the yard, fence ring, and fence-post signs. */
export const createYard = (): ThreeGroup => {
  const root = new THREE.Group()
  const extent = (lastCell + 1) * cellSize
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(extent, 0.12, extent),
    grass,
  )
  ground.position.y = -0.06
  ground.receiveShadow = true
  root.add(ground)

  const path = new THREE.Mesh(new THREE.BoxGeometry(cellSize * 1.1, 0.04, cellSize * 7), dirt)
  path.position.set(0, 0.01, 0.4)
  path.receiveShadow = true
  root.add(path)

  const axis = Array.range(0, lastCell)
  Array.forEach(axis, x => {
    Array.forEach(axis, z => {
      if (x !== 0 && x !== lastCell && z !== 0 && z !== lastCell) {
        return
      }
      const world = worldFromCell(gridCoord(x, z))
      addFencePost(root, world.x, world.z)
    })
  })

  const half = (lastCell / 2) * cellSize
  addRail(root, 0, -half, extent - cellSize, 0.1)
  addRail(root, 0, half, extent - cellSize, 0.1)
  addRail(root, -half, 0, 0.1, extent - cellSize)
  addRail(root, half, 0, 0.1, extent - cellSize)

  Array.forEach(signCells, placement => {
    const maybeSign = Array.findFirst(signs, item => item.id === placement.id)
    const speaker = Option.isSome(maybeSign)
      ? maybeSign.value.speaker
      : placement.id
    const world = worldFromCell(placement.at)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.35, 8), wood)
    post.position.set(world.x, 0.67, world.z)
    post.castShadow = true
    root.add(post)
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.46, 0.08),
      new THREE.MeshStandardMaterial({
        map: makeSignTexture(speaker),
        color: 0xffffff,
        roughness: 0.65,
        metalness: 0.04,
        emissive: 0x3a2a12,
        emissiveIntensity: 0.2,
      }),
    )
    plaque.position.set(world.x, 1.18, world.z)
    plaque.castShadow = true
    root.add(plaque)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), board)
    cap.position.set(world.x, 1.38, world.z)
    root.add(cap)
  })

  const machineMark = worldFromCell(vendingAt)
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.08, 20), dirt)
  pad.position.set(machineMark.x, 0.04, machineMark.z)
  pad.receiveShadow = true
  root.add(pad)

  return root
}
