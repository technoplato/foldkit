import * as THREE from 'three'

import type { ThreeDirectionalLight, ThreeScene } from './three-compat.js'

/** Hemisphere fill plus a single shadowed sun. */
export const createYardLights = (
  scene: ThreeScene,
): ThreeDirectionalLight => {
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x2a3a24, 0.72))
  const sun = new THREE.DirectionalLight(0xfff1d0, 2.1)
  sun.position.set(8.5, 12.5, 6.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 40
  sun.shadow.camera.left = -16
  sun.shadow.camera.right = 16
  sun.shadow.camera.top = 16
  sun.shadow.camera.bottom = -16
  sun.shadow.bias = -0.00025
  scene.add(sun)
  scene.add(sun.target)
  return sun
}
