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
  update: (
    vendPhase: string,
    deltaSeconds: number,
    elapsedSeconds: number,
  ) => boolean
}>

/** Door spring, keypad press, clip fall, and LED pulse from vendPhase. */
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
  let clipOnShelf = true
  let lastPhase = 'Idle'
  const jewelColor = new THREE.Color()

  return {
    notePress: label => {
      heldLabel = label
    },
    releasePress: () => {
      heldLabel = undefined
    },
    update: (vendPhase, deltaSeconds, elapsedSeconds) => {
      const dt = Math.min(Math.max(deltaSeconds, 0), maximumDeltaSeconds)
      if (lastPhase === 'Dispensed' && vendPhase === 'Idle') {
        clipOnShelf = true
        clipElapsed = 0
        assembly.clip.position.copy(assembly.clipShelf)
      }
      if (
        (vendPhase === 'Dispensed' || vendPhase === 'Vending') &&
        clipOnShelf
      ) {
        clipOnShelf = false
        clipElapsed = 0
      }
      lastPhase = vendPhase

      const doorTarget = vendPhase === 'Dispensed' ? 1 : 0
      const previousDoor = door.value
      stepSpring(door, doorTarget, doorStiffness, doorDamping, dt)
      assembly.doorPivot.rotation.x = door.value * doorOpenRadians

      if (!clipOnShelf) {
        clipElapsed += dt
        const t = Math.min(clipElapsed / clipFallSeconds, 1)
        const eased = t * t * (3 - 2 * t)
        assembly.clip.position.lerpVectors(
          assembly.clipShelf,
          assembly.clipBin,
          eased,
        )
        assembly.clip.position.x += Math.sin(t * Math.PI) * 0.03
        assembly.clip.rotation.z = eased * 0.35
        if (t >= 1) {
          assembly.clip.position.copy(assembly.clipBin)
          assembly.clip.rotation.z = 0.35
        }
      }

      for (const button of assembly.buttons) {
        const spring = presses.get(button.spec.label)
        if (spring === undefined) {
          continue
        }
        const target = heldLabel === button.spec.label ? 1 : 0
        stepSpring(spring, target, keyStiffness, keyDamping, dt)
        button.mesh.position.z = button.restZ - spring.value * 0.012
      }

      const pulse = 1 + 0.05 * Math.sin(elapsedSeconds * 7.3)
      const intensity = ledIntensityForPhase(vendPhase) * pulse
      assembly.materials.ledPanel.emissiveIntensity = intensity
      const bloomScale = intensity / 2.2
      assembly.materials.ledBloom.color.setHex(0x7cff9a)
      assembly.materials.ledBloom.color.multiplyScalar(bloomScale)
      jewelColor.setHex(jewelColorForPhase(vendPhase))
      jewelColor.multiplyScalar(0.8 + 0.35 * pulse)
      assembly.materials.jewel.color.copy(jewelColor)

      return Math.abs(door.value - previousDoor) > 0.0008
    },
  }
}
