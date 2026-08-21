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
  phoneCameraBackScale,
  phoneViewportMaxWidth,
} from '../cabinet/design-contract.js'
import {
  phoneHeight,
  phoneHeroDistance,
  phoneHeroFov,
} from '../phone/iphone-contract.js'
import type { ThreePerspectiveCamera, ThreeVector3 } from '../three-compat.js'

export type CameraShot = 'machine' | 'phone-hero'

export type CameraDirectionContract = Readonly<{
  subjectScale: number
  projection: Readonly<{ fov: number; near: number; far: number }>
  positionMode: 'authored' | 'phone-hero'
  upMode: 'world'
  inputMode: 'orbit-offset'
  handoffOwner: 'machine-camera'
}>

const machineLook = new THREE.Vector3(lookSide, lookHeight, 0)
const phoneLook = new THREE.Vector3(lookSide, lookHeight * 0.86, 0)
const desktopRestOffset = new THREE.Vector3(
  cameraSide,
  cameraHeight - lookHeight,
  cameraBack,
)
const phoneRestOffset = new THREE.Vector3(
  cameraSide,
  cameraHeight - lookHeight,
  machineHeight * phoneCameraBackScale,
)
const desktopRestDistance = desktopRestOffset.length()
const phoneRestDistance = phoneRestOffset.length()
const restYaw = Math.atan2(desktopRestOffset.x, desktopRestOffset.z)
const restPitch = Math.atan2(
  desktopRestOffset.y,
  Math.hypot(desktopRestOffset.x, desktopRestOffset.z),
)
const desktopMinDistance = machineHeight * 1.65
const desktopMaxDistance = machineHeight * 2.85
const phoneMinDistance = machineHeight * 2.6
const phoneMaxDistance = machineHeight * 4.1
const heroMinDistance = phoneHeight * 1.7
const heroMaxDistance = phoneHeight * 3.4

const isPhoneViewport = (width: number): boolean =>
  width < phoneViewportMaxWidth ||
  window.matchMedia('(pointer: coarse)').matches

export type MachineCamera = Readonly<{
  camera: ThreePerspectiveCamera
  contract: CameraDirectionContract
  setSize: (width: number, height: number) => void
  setShot: (shot: CameraShot, lookAt?: ThreeVector3) => void
  orbitBy: (deltaX: number, deltaY: number) => void
  dollyBy: (delta: number) => void
  update: (deltaSeconds: number) => void
  restore: () => void
}>

/** Authored 3/4 hero camera with a bounded orbit offset and one phone handoff. */
export const createMachineCamera = (): MachineCamera => {
  const camera = new THREE.PerspectiveCamera(
    cameraFov,
    1,
    cameraNear,
    cameraFar,
  )
  const lookTarget = machineLook.clone()
  const desiredLook = machineLook.clone()
  const desired = {
    yaw: restYaw,
    pitch: restPitch,
    distance: desktopRestDistance,
    fov: cameraFov,
  }
  const current = {
    yaw: restYaw,
    pitch: restPitch,
    distance: desktopRestDistance,
    fov: cameraFov,
  }
  const scratch = new THREE.Vector3()
  let shot: CameraShot = 'machine'
  let minDistance = desktopMinDistance
  let maxDistance = desktopMaxDistance
  let viewportIsPhone = false
  let fittedOnce = false

  const applyPose = (
    yaw: number,
    pitch: number,
    distance: number,
    fov: number,
  ): void => {
    scratch.set(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    )
    camera.position.copy(lookTarget).add(scratch)
    camera.up.set(0, 1, 0)
    camera.lookAt(lookTarget)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }

  applyPose(current.yaw, current.pitch, current.distance, current.fov)

  const snapPose = (): void => {
    current.yaw = desired.yaw
    current.pitch = desired.pitch
    current.distance = desired.distance
    current.fov = desired.fov
    lookTarget.copy(desiredLook)
    applyPose(current.yaw, current.pitch, current.distance, current.fov)
  }

  const fitMachineViewport = (snap: boolean): void => {
    minDistance = viewportIsPhone ? phoneMinDistance : desktopMinDistance
    maxDistance = viewportIsPhone ? phoneMaxDistance : desktopMaxDistance
    const nextRest = viewportIsPhone ? phoneRestDistance : desktopRestDistance
    desired.distance = THREE.MathUtils.clamp(nextRest, minDistance, maxDistance)
    desired.fov = cameraFov
    desiredLook.copy(viewportIsPhone ? phoneLook : machineLook)
    if (snap) {
      snapPose()
    }
  }

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
      const nextIsPhone = isPhoneViewport(width)
      const modeChanged = nextIsPhone !== viewportIsPhone
      viewportIsPhone = nextIsPhone
      if (shot !== 'machine') {
        return
      }
      if (!fittedOnce || modeChanged) {
        fitMachineViewport(!fittedOnce)
        fittedOnce = true
      }
    },
    setShot: (nextShot, lookAt) => {
      shot = nextShot
      if (nextShot === 'phone-hero' && lookAt !== undefined) {
        desiredLook.copy(lookAt)
        minDistance = heroMinDistance
        maxDistance = heroMaxDistance
        desired.distance = THREE.MathUtils.clamp(
          phoneHeroDistance,
          minDistance,
          maxDistance,
        )
        desired.fov = phoneHeroFov
        desired.yaw = restYaw * 0.35
        desired.pitch = 0.04
        return
      }
      desiredLook.copy(viewportIsPhone ? phoneLook : machineLook)
      desired.yaw = restYaw
      desired.pitch = restPitch
      fitMachineViewport(false)
    },
    orbitBy: (deltaX, deltaY) => {
      const yawMax = shot === 'phone-hero' ? 0.55 : orbitYawMax
      const pitchMax = shot === 'phone-hero' ? 0.22 : orbitPitchMax
      desired.yaw = THREE.MathUtils.clamp(
        desired.yaw - deltaX * 0.005,
        restYaw - yawMax,
        restYaw + yawMax,
      )
      desired.pitch = THREE.MathUtils.clamp(
        desired.pitch + deltaY * 0.0035,
        restPitch - pitchMax,
        restPitch + pitchMax,
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
      const alpha = 1 - Math.exp(-3.6 * dt)
      current.yaw = THREE.MathUtils.lerp(current.yaw, desired.yaw, alpha)
      current.pitch = THREE.MathUtils.lerp(current.pitch, desired.pitch, alpha)
      current.distance = THREE.MathUtils.lerp(
        current.distance,
        desired.distance,
        alpha,
      )
      current.fov = THREE.MathUtils.lerp(current.fov, desired.fov, alpha)
      lookTarget.lerp(desiredLook, alpha)
      applyPose(current.yaw, current.pitch, current.distance, current.fov)
    },
    restore: () => {
      camera.fov = cameraFov
      camera.near = cameraNear
      camera.far = cameraFar
      camera.updateProjectionMatrix()
    },
  }
}
