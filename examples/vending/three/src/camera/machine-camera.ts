import * as THREE from 'three'

import {
  cameraBack,
  cameraFar,
  cameraFov,
  cameraHeight,
  cameraNear,
  cameraSide,
  lookHeight,
  lookSide,
  machineHeight,
  maximumDeltaSeconds,
  orbitPitchMax,
  orbitYawMax,
} from '../cabinet/design-contract.js'
import type { ThreePerspectiveCamera } from '../three-compat.js'

export type CameraDirectionContract = Readonly<{
  subjectScale: number
  projection: Readonly<{ fov: number; near: number; far: number }>
  positionMode: 'authored'
  upMode: 'world'
  inputMode: 'orbit-offset'
  handoffOwner: 'machine-camera'
}>

const lookTarget = new THREE.Vector3(lookSide, lookHeight, 0)
const restOffset = new THREE.Vector3(
  cameraSide,
  cameraHeight - lookHeight,
  cameraBack,
)
const restDistance = restOffset.length()
const restYaw = Math.atan2(restOffset.x, restOffset.z)
const restPitch = Math.atan2(
  restOffset.y,
  Math.hypot(restOffset.x, restOffset.z),
)
const minDistance = machineHeight * 1.65
const maxDistance = machineHeight * 2.85

export type MachineCamera = Readonly<{
  camera: ThreePerspectiveCamera
  contract: CameraDirectionContract
  setSize: (width: number, height: number) => void
  orbitBy: (deltaX: number, deltaY: number) => void
  dollyBy: (delta: number) => void
  update: (deltaSeconds: number) => void
  restore: () => void
}>

/** Authored 3/4 hero camera with a bounded orbit offset. */
export const createMachineCamera = (): MachineCamera => {
  const camera = new THREE.PerspectiveCamera(
    cameraFov,
    1,
    cameraNear,
    cameraFar,
  )
  const desired = {
    yaw: restYaw,
    pitch: restPitch,
    distance: restDistance,
  }
  const current = {
    yaw: restYaw,
    pitch: restPitch,
    distance: restDistance,
  }
  const scratch = new THREE.Vector3()

  const applyPose = (yaw: number, pitch: number, distance: number): void => {
    scratch.set(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    )
    camera.position.copy(lookTarget).add(scratch)
    camera.up.set(0, 1, 0)
    camera.lookAt(lookTarget)
  }

  applyPose(current.yaw, current.pitch, current.distance)

  return {
    camera,
    contract: {
      subjectScale: machineHeight,
      projection: { fov: cameraFov, near: cameraNear, far: cameraFar },
      positionMode: 'authored',
      upMode: 'world',
      inputMode: 'orbit-offset',
      handoffOwner: 'machine-camera',
    },
    setSize: (width, height) => {
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    },
    orbitBy: (deltaX, deltaY) => {
      desired.yaw = THREE.MathUtils.clamp(
        desired.yaw - deltaX * 0.005,
        restYaw - orbitYawMax,
        restYaw + orbitYawMax,
      )
      desired.pitch = THREE.MathUtils.clamp(
        desired.pitch + deltaY * 0.0035,
        restPitch - orbitPitchMax,
        restPitch + orbitPitchMax,
      )
    },
    dollyBy: delta => {
      desired.distance = THREE.MathUtils.clamp(
        desired.distance + delta,
        minDistance,
        maxDistance,
      )
    },
    update: deltaSeconds => {
      const dt = Math.min(Math.max(deltaSeconds, 0), maximumDeltaSeconds)
      const alpha = 1 - Math.exp(-10 * dt)
      current.yaw = THREE.MathUtils.lerp(current.yaw, desired.yaw, alpha)
      current.pitch = THREE.MathUtils.lerp(current.pitch, desired.pitch, alpha)
      current.distance = THREE.MathUtils.lerp(
        current.distance,
        desired.distance,
        alpha,
      )
      applyPose(current.yaw, current.pitch, current.distance)
    },
    restore: () => {
      camera.fov = cameraFov
      camera.near = cameraNear
      camera.far = cameraFar
      camera.updateProjectionMatrix()
    },
  }
}
