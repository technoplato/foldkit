import type { CardinalFacing } from 'foldkit/spatial'
import type { GridCoord } from 'foldkit/spatial'
import * as THREE from 'three'

import { worldFromCell, yawFromFacing } from './layout.js'
import type { ThreeGroup } from './three-compat.js'

const skin = new THREE.MeshStandardMaterial({
  color: 0xe8c39a,
  roughness: 0.62,
  metalness: 0.04,
})
const shirt = new THREE.MeshStandardMaterial({
  color: 0x2f6f4e,
  roughness: 0.55,
  metalness: 0.08,
})
const pants = new THREE.MeshStandardMaterial({
  color: 0x2a3344,
  roughness: 0.7,
  metalness: 0.05,
})
const hair = new THREE.MeshStandardMaterial({
  color: 0x3b2416,
  roughness: 0.8,
  metalness: 0.02,
})

/** Builds a small man from real meshes, not a sprite. */
export const createWalker = (): ThreeGroup => {
  const root = new THREE.Group()
  root.name = 'walker'

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.28), shirt)
  torso.position.y = 0.86
  torso.castShadow = true
  root.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), skin)
  head.position.y = 1.28
  head.castShadow = true
  root.add(head)

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.185, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    hair,
  )
  cap.position.y = 1.34
  cap.castShadow = true
  root.add(cap)

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.12), skin)
  leftArm.position.set(-0.3, 0.84, 0)
  leftArm.name = 'leftArm'
  leftArm.castShadow = true
  root.add(leftArm)

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.12), skin)
  rightArm.position.set(0.3, 0.84, 0)
  rightArm.name = 'rightArm'
  rightArm.castShadow = true
  root.add(rightArm)

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.16), pants)
  leftLeg.position.set(-0.12, 0.34, 0)
  leftLeg.name = 'leftLeg'
  leftLeg.castShadow = true
  root.add(leftLeg)

  const rightLeg = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.46, 0.16),
    pants,
  )
  rightLeg.position.set(0.12, 0.34, 0)
  rightLeg.name = 'rightLeg'
  rightLeg.castShadow = true
  root.add(rightLeg)

  return root
}

/** Springs the walker toward the Model pose and swings limbs while moving. */
export const syncWalker = (
  walker: ThreeGroup,
  at: GridCoord,
  facing: CardinalFacing,
  deltaSeconds: number,
  isRoaming: boolean,
): void => {
  const target = worldFromCell(at)
  const follow = 1 - Math.exp(-10 * deltaSeconds)
  walker.position.x += (target.x - walker.position.x) * follow
  walker.position.z += (target.z - walker.position.z) * follow
  const yaw = yawFromFacing(facing)
  let nextYaw = walker.rotation.y
  let deltaYaw = yaw - nextYaw
  while (deltaYaw > Math.PI) {
    deltaYaw -= Math.PI * 2
  }
  while (deltaYaw < -Math.PI) {
    deltaYaw += Math.PI * 2
  }
  walker.rotation.y += deltaYaw * follow

  const speed = Math.hypot(
    target.x - walker.position.x,
    target.z - walker.position.z,
  )
  const swing = isRoaming
    ? Math.sin(performance.now() * 0.012) * Math.min(0.7, speed * 8 + 0.08)
    : 0
  const leftArm = walker.getObjectByName('leftArm')
  const rightArm = walker.getObjectByName('rightArm')
  const leftLeg = walker.getObjectByName('leftLeg')
  const rightLeg = walker.getObjectByName('rightLeg')
  if (leftArm !== undefined) {
    leftArm.rotation.x = swing
  }
  if (rightArm !== undefined) {
    rightArm.rotation.x = -swing
  }
  if (leftLeg !== undefined) {
    leftLeg.rotation.x = -swing
  }
  if (rightLeg !== undefined) {
    rightLeg.rotation.x = swing
  }
}
