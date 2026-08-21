import * as THREE from 'three'

import type {
  ThreeCanvasTexture,
  ThreeMeshBasicMaterial,
  ThreeMeshPhysicalMaterial,
  ThreeMeshStandardMaterial,
} from '../three-compat.js'
import { machineSeed } from './design-contract.js'

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

const createPaintBundle = (
  size: number,
): { albedo: ThreeCanvasTexture; roughness: ThreeCanvasTexture } => {
  const random = mulberry32(machineSeed)
  const albedoCanvas = document.createElement('canvas')
  albedoCanvas.width = size
  albedoCanvas.height = size
  const roughnessCanvas = document.createElement('canvas')
  roughnessCanvas.width = size
  roughnessCanvas.height = size
  const albedo = albedoCanvas.getContext('2d')
  const roughness = roughnessCanvas.getContext('2d')
  if (albedo === null || roughness === null) {
    throw new Error('2d context unavailable')
  }
  albedo.fillStyle = '#7f1e1b'
  albedo.fillRect(0, 0, size, size)
  roughness.fillStyle = '#6e6e6e'
  roughness.fillRect(0, 0, size, size)
  for (let index = 0; index < 1400; index += 1) {
    const x = random() * size
    const y = random() * size
    const radius = 0.4 + random() * 1.8
    const dirt = 0.04 + random() * 0.1
    albedo.fillStyle = `rgba(28, 12, 10, ${dirt})`
    albedo.beginPath()
    albedo.arc(x, y, radius, 0, Math.PI * 2)
    albedo.fill()
    const rough = Math.floor(110 + random() * 70)
    roughness.fillStyle = `rgb(${rough}, ${rough}, ${rough})`
    roughness.fillRect(x, y, 1.4, 1.4)
  }
  const albedoTexture = new THREE.CanvasTexture(albedoCanvas)
  albedoTexture.colorSpace = THREE.SRGBColorSpace
  albedoTexture.wrapS = THREE.RepeatWrapping
  albedoTexture.wrapT = THREE.RepeatWrapping
  albedoTexture.anisotropy = 8
  const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas)
  roughnessTexture.wrapS = THREE.RepeatWrapping
  roughnessTexture.wrapT = THREE.RepeatWrapping
  return { albedo: albedoTexture, roughness: roughnessTexture }
}

export type CabinetMaterials = Readonly<{
  paintedSteel: ThreeMeshPhysicalMaterial
  chrome: ThreeMeshPhysicalMaterial
  glass: ThreeMeshPhysicalMaterial
  rubber: ThreeMeshStandardMaterial
  interior: ThreeMeshStandardMaterial
  booth: ThreeMeshStandardMaterial
  tortoise: ThreeMeshPhysicalMaterial
  brass: ThreeMeshPhysicalMaterial
  ledPanel: ThreeMeshStandardMaterial
  ledBloom: ThreeMeshBasicMaterial
  jewel: ThreeMeshBasicMaterial
  brand: ThreeMeshBasicMaterial
  price: ThreeMeshBasicMaterial
  qr: ThreeMeshBasicMaterial
  dispose: () => void
}>

/** Authored PBR identities for the cabinet and booth. */
export const createCabinetMaterials = (): CabinetMaterials => {
  const paint = createPaintBundle(256)
  const paintedSteel = new THREE.MeshPhysicalMaterial({
    map: paint.albedo,
    roughnessMap: paint.roughness,
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.16,
    clearcoat: 0.38,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.85,
  })
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd8dee6,
    roughness: 0.16,
    metalness: 0.94,
    envMapIntensity: 1.1,
  })
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdfefff,
    roughness: 0.035,
    metalness: 0,
    transmission: 1,
    thickness: 0.008,
    ior: 1.52,
    attenuationColor: 0xc8e4ff,
    attenuationDistance: 0.55,
    transparent: true,
    envMapIntensity: 1,
  })
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x1a1612,
    roughness: 0.74,
    metalness: 0.04,
  })
  const interior = new THREE.MeshStandardMaterial({
    color: 0x1c1a18,
    roughness: 0.62,
    metalness: 0.08,
  })
  const booth = new THREE.MeshStandardMaterial({
    color: 0x2a2622,
    roughness: 0.94,
    metalness: 0.02,
  })
  const tortoise = new THREE.MeshPhysicalMaterial({
    color: 0x6b3a1f,
    roughness: 0.38,
    metalness: 0.08,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
  })
  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xb08a3c,
    roughness: 0.28,
    metalness: 0.82,
  })
  const ledPanel = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.92,
    roughness: 0.42,
    metalness: 0,
  })
  const ledBloom = new THREE.MeshBasicMaterial({
    color: 0x14331c,
    toneMapped: false,
    transparent: true,
    opacity: 0.35,
  })
  const jewel = new THREE.MeshBasicMaterial({
    color: 0xf0b060,
    toneMapped: false,
  })
  const brand = new THREE.MeshBasicMaterial({ color: 0xf6d59a })
  const price = new THREE.MeshBasicMaterial({ color: 0xf6d59a })
  const qr = new THREE.MeshBasicMaterial({ color: 0xffffff })

  const all = [
    paintedSteel,
    chrome,
    glass,
    rubber,
    interior,
    booth,
    tortoise,
    brass,
    ledPanel,
    ledBloom,
    jewel,
    brand,
    price,
    qr,
  ]

  return {
    paintedSteel,
    chrome,
    glass,
    rubber,
    interior,
    booth,
    tortoise,
    brass,
    ledPanel,
    ledBloom,
    jewel,
    brand,
    price,
    qr,
    dispose: () => {
      paint.albedo.dispose()
      paint.roughness.dispose()
      for (const material of all) {
        material.dispose()
      }
    },
  }
}
