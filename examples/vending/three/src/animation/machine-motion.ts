import * as THREE from 'three'

import type { CabinetAssembly } from '../cabinet/cabinet-assembly.js'
import {
  clipFallSeconds,
  doorDamping,
  doorOpenRadians,
  doorStiffness,
  jewelColorForPhase,
  keyDamping,
  keyStiffness,
  ledIntensityForPhase,
  maximumDeltaSeconds,
  phonePresentSeconds,
} from '../cabinet/design-contract.js'

type Spring1 = {
  value: number
  velocity: number
}

const stepSpring = (
  spring: Spring1,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): void => {
  const acceleration =
    (target - spring.value) * stiffness - spring.velocity * damping
  spring.velocity += acceleration * dt
  spring.value += spring.velocity * dt
  if (
    Math.abs(target - spring.value) < 0.002 &&
    Math.abs(spring.velocity) < 0.01
  ) {
    spring.value = target
    spring.velocity = 0
  }
}

export type MachineMotion = Readonly<{
  notePress: (label: string) => void
  releasePress: () => void
  presented: () => boolean
  update: (
    vendPhase: string,
    lastControl: string | undefined,
    deltaSeconds: number,
    elapsedSeconds: number,
  ) => boolean
}>

/** Door spring, keypad press, phone fall, presentation, and LED pulse. */
export const createMachineMotion = (
  assembly: CabinetAssembly,
): MachineMotion => {
  const door = { value: 0, velocity: 0 }
  const presses = new Map<string, Spring1>()
  for (const button of assembly.buttons) {
    presses.set(button.spec.label, { value: 0, velocity: 0 })
  }
  let heldLabel: string | undefined
  let clipElapsed = 0
  let presentElapsed = 0
  let clipOnShelf = true
  let phonePresented = false
  let lastPhase = 'Idle'
  const jewelColor = new THREE.Color()
  const shelfQuat = new THREE.Quaternion()
  const presentQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.08, 0.18, 0),
  )

  return {
    notePress: label => {
      heldLabel = label
    },
    releasePress: () => {
      heldLabel = undefined
    },
    presented: () => phonePresented,
    update: (vendPhase, lastControl, deltaSeconds, elapsedSeconds) => {
      const dt = Math.min(Math.max(deltaSeconds, 0), maximumDeltaSeconds)
      if (lastPhase === 'Dispensed' && vendPhase === 'Idle') {
        clipOnShelf = true
        phonePresented = false
        clipElapsed = 0
        presentElapsed = 0
        assembly.clip.position.copy(assembly.clipShelf)
        assembly.clip.quaternion.identity()
      }
      if (
        (vendPhase === 'Dispensed' || vendPhase === 'Vending') &&
        clipOnShelf
      ) {
        clipOnShelf = false
        phonePresented = false
        clipElapsed = 0
        presentElapsed = 0
      }
      lastPhase = vendPhase

      const doorTarget = vendPhase === 'Dispensed' ? 1 : 0
      const previousDoor = door.value
      stepSpring(door, doorTarget, doorStiffness, doorDamping, dt)
      assembly.doorPivot.rotation.x = door.value * doorOpenRadians

      if (!clipOnShelf && !phonePresented) {
        clipElapsed += dt
        const t = Math.min(clipElapsed / clipFallSeconds, 1)
        const eased = t * t * (3 - 2 * t)
        assembly.clip.position.lerpVectors(
          assembly.clipShelf,
          assembly.clipBin,
          eased,
        )
        assembly.clip.position.x += Math.sin(t * Math.PI) * 0.03
        assembly.clip.rotation.z = eased * 0.28
        if (t >= 1 && vendPhase === 'Dispensed') {
          presentElapsed += dt
          const presentT = Math.min(presentElapsed / phonePresentSeconds, 1)
          const presentEase = presentT * presentT * (3 - 2 * presentT)
          assembly.clip.position.lerpVectors(
            assembly.clipBin,
            assembly.clipPresent,
            presentEase,
          )
          shelfQuat.setFromEuler(new THREE.Euler(0, 0, 0.28))
          assembly.clip.quaternion.slerpQuaternions(
            shelfQuat,
            presentQuat,
            presentEase,
          )
          if (presentT >= 1) {
            phonePresented = true
            assembly.clip.position.copy(assembly.clipPresent)
            assembly.clip.quaternion.copy(presentQuat)
          }
        }
      }

      for (const button of assembly.buttons) {
        const spring = presses.get(button.spec.label)
        if (spring === undefined) {
          continue
        }
        const target =
          heldLabel === button.spec.label
            ? 1
            : lastControl === button.spec.label
              ? 0.42
              : 0
        stepSpring(spring, target, keyStiffness, keyDamping, dt)
        button.mesh.position.z = button.restZ - spring.value * 0.034
      }

      const pulse = 1 + 0.012 * Math.sin(elapsedSeconds * 1.6)
      assembly.materials.ledPanel.emissiveIntensity = 0.92
      const bloomScale = 0.28 + ledIntensityForPhase(vendPhase) * 0.04 * pulse
      assembly.materials.ledBloom.color.setHex(0x1c4a28)
      assembly.materials.ledBloom.color.multiplyScalar(bloomScale)
      jewelColor.setHex(jewelColorForPhase(vendPhase))
      jewelColor.multiplyScalar(0.8 + 0.35 * pulse)
      assembly.materials.jewel.color.copy(jewelColor)

      return Math.abs(door.value - previousDoor) > 0.0008
    },
  }
}
