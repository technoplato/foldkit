import * as THREE from 'three'
import { vendingAt } from 'world-core-example'

import { worldFromCell } from './layout.js'
import type { ThreeGroup } from './three-compat.js'

/** Readable PBR cabinet. Does not import in-flight vending/three modules. */
export const createCabinet = (): ThreeGroup => {
  const root = new THREE.Group()
  const origin = worldFromCell(vendingAt)
  root.position.set(origin.x, 0, origin.z)

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.85, 0.72),
    new THREE.MeshPhysicalMaterial({
      color: 0x8a1f2b,
      roughness: 0.38,
      metalness: 0.22,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    }),
  )
  body.position.y = 0.95
  body.castShadow = true
  body.receiveShadow = true
  root.add(body)

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.95, 0.06),
    new THREE.MeshPhysicalMaterial({
      color: 0x9ad7ff,
      roughness: 0.08,
      metalness: 0.05,
      transmission: 0.55,
      thickness: 0.12,
      transparent: true,
      opacity: 0.85,
    }),
  )
  glass.position.set(0, 1.22, 0.38)
  root.add(glass)

  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.16, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x0b1a12,
      emissive: 0x3cff9a,
      emissiveIntensity: 1.4,
      roughness: 0.35,
    }),
  )
  display.position.set(0.28, 0.62, 0.38)
  root.add(display)

  const keypad = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.32, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.45,
      metalness: 0.2,
    }),
  )
  keypad.position.set(0.28, 0.36, 0.38)
  root.add(keypad)

  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.06, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0xffe08a,
      emissive: 0xffc14d,
      emissiveIntensity: 2.2,
      roughness: 0.3,
    }),
  )
  led.position.set(0, 1.82, 0.2)
  root.add(led)

  return root
}
