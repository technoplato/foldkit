import * as THREE from 'three'

import {
  machineDepth,
  machineHeight,
  machineWidth,
  shadowBias,
  shadowMapSize,
  shadowNormalBias,
} from '../cabinet/design-contract.js'
import type {
  ThreeDirectionalLight,
  ThreeHemisphereLight,
  ThreePerspectiveCamera,
  ThreePointLight,
  ThreeScene,
  ThreeVector3,
} from '../three-compat.js'

export type MachineLights = Readonly<{
  key: ThreeDirectionalLight
  fill: ThreeDirectionalLight
  hemi: ThreeHemisphereLight
  interior: ThreePointLight
  invalidate: () => void
  updateFit: (camera: ThreePerspectiveCamera) => void
  dispose: () => void
}>

/** Bounded directional shadow fitted to the cabinet, with texel snap. */
export const createMachineLights = (scene: ThreeScene): MachineLights => {
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x1a1410, 0.55)
  scene.add(hemi)

  const key = new THREE.DirectionalLight(0xffe6c4, 2.35)
  key.position.set(2.55, 5.15, 3.7)
  key.castShadow = true
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize)
  key.shadow.bias = shadowBias
  key.shadow.normalBias = shadowNormalBias
  key.shadow.autoUpdate = false
  key.shadow.needsUpdate = true
  scene.add(key)
  scene.add(key.target)
  key.target.position.set(0, 0.72, 0)

  const fill = new THREE.DirectionalLight(0x8aa0c4, 0.28)
  fill.position.set(-3.4, 1.6, -1.8)
  scene.add(fill)

  const interior = new THREE.PointLight(0xcfe8ff, 1.35, 1.8, 1.6)
  interior.position.set(-0.12, 1.18, 0.04)
  scene.add(interior)

  const worldCorners: ReadonlyArray<ThreeVector3> = [
    new THREE.Vector3(-machineWidth, 0, -machineDepth),
    new THREE.Vector3(machineWidth, 0, -machineDepth),
    new THREE.Vector3(-machineWidth, 0, machineDepth * 1.4),
    new THREE.Vector3(machineWidth, 0, machineDepth * 1.4),
    new THREE.Vector3(-machineWidth, machineHeight, -machineDepth),
    new THREE.Vector3(machineWidth, machineHeight, -machineDepth),
    new THREE.Vector3(-machineWidth, machineHeight, machineDepth * 1.4),
    new THREE.Vector3(machineWidth, machineHeight, machineDepth * 1.4),
  ]
  const lightSpace = new THREE.Vector3()

  const updateFit = (_camera: ThreePerspectiveCamera): void => {
    key.updateMatrixWorld()
    key.target.updateMatrixWorld()
    const inverse = new THREE.Matrix4().copy(key.matrixWorld).invert()
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const corner of worldCorners) {
      lightSpace.copy(corner).applyMatrix4(inverse)
      minX = Math.min(minX, lightSpace.x)
      maxX = Math.max(maxX, lightSpace.x)
      minY = Math.min(minY, lightSpace.y)
      maxY = Math.max(maxY, lightSpace.y)
      minZ = Math.min(minZ, lightSpace.z)
      maxZ = Math.max(maxZ, lightSpace.z)
    }
    const width = Math.max(maxX - minX, 0.5)
    const height = Math.max(maxY - minY, 0.5)
    const texelX = width / shadowMapSize
    const texelY = height / shadowMapSize
    const centerX = Math.round((minX + maxX) / 2 / texelX) * texelX
    const centerY = Math.round((minY + maxY) / 2 / texelY) * texelY
    const halfW = width / 2 + texelX
    const halfH = height / 2 + texelY
    const shadowCamera = key.shadow.camera
    shadowCamera.left = centerX - halfW
    shadowCamera.right = centerX + halfW
    shadowCamera.bottom = centerY - halfH
    shadowCamera.top = centerY + halfH
    shadowCamera.near = 0.4
    shadowCamera.far = Math.max(12, maxZ - minZ + 6)
    shadowCamera.updateProjectionMatrix()
  }

  return {
    key,
    fill,
    hemi,
    interior,
    invalidate: () => {
      key.shadow.needsUpdate = true
    },
    updateFit,
    dispose: () => {
      key.dispose()
      fill.dispose()
      hemi.dispose()
      interior.dispose()
    },
  }
}
