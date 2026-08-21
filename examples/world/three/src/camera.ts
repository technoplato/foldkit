import type { CardinalFacing } from 'foldkit/spatial'
import type { GridCoord } from 'foldkit/spatial'
import * as THREE from 'three'

import { worldFromCell, yawFromFacing } from './layout.js'
import type { ThreePerspectiveCamera } from './three-compat.js'

/** Chase camera that sits behind and above the walker. */
export const createChaseCamera = (aspect: number): ThreePerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 80)
  camera.position.set(0, 6.2, 8.4)
  return camera
}

/** Springs the chase camera toward a body-relative offset. */
export const syncChaseCamera = (
  camera: ThreePerspectiveCamera,
  at: GridCoord,
  facing: CardinalFacing,
  deltaSeconds: number,
): void => {
  const origin = worldFromCell(at)
  const yaw = yawFromFacing(facing)
  const back = 6.4
  const height = 4.6
  const targetX = origin.x + Math.sin(yaw) * back
  const targetZ = origin.z + Math.cos(yaw) * back
  const follow = 1 - Math.exp(-4.2 * deltaSeconds)
  camera.position.x += (targetX - camera.position.x) * follow
  camera.position.y += (height - camera.position.y) * follow
  camera.position.z += (targetZ - camera.position.z) * follow
  camera.lookAt(origin.x, 1.1, origin.z)
}
