import * as THREE from 'three'

import type {
  ThreeBoxGeometry,
  ThreeBufferGeometry,
  ThreeVector3,
} from '../three-compat.js'
import type { CabinetPlan, KitPlacement, MassBox } from './cabinet-plan.js'
import {
  glassBottom,
  glassHeight,
  glassLeft,
  glassWidth,
  glassZ,
} from './design-contract.js'
import { type MaterialSlot, createMeshWriter } from './mesh-writer.js'

const profilePoints: ReadonlyArray<Readonly<{ x: number; z: number }>> = [
  { x: 0, z: 0.005 },
  { x: 0.005, z: 0.011 },
  { x: 0.016, z: 0.01 },
  { x: 0.02, z: 0.002 },
  { x: 0.02, z: -0.014 },
  { x: 0.004, z: -0.014 },
  { x: 0, z: -0.003 },
]

const pushVertex = (
  positions: Array<number>,
  normals: Array<number>,
  uvs: Array<number>,
  point: ThreeVector3,
  normal: ThreeVector3,
  u: number,
  v: number,
): number => {
  const index = positions.length / 3
  positions.push(point.x, point.y, point.z)
  normals.push(normal.x, normal.y, normal.z)
  uvs.push(u, v)
  return index
}

const framePoint = (
  side: 'bottom' | 'right' | 'top' | 'left',
  along: number,
  outward: number,
  forward: number,
): ThreeVector3 => {
  const innerLeft = glassLeft
  const innerRight = glassLeft + glassWidth
  const innerBottom = glassBottom
  const innerTop = glassBottom + glassHeight
  if (side === 'bottom') {
    return new THREE.Vector3(
      innerLeft + along * glassWidth,
      innerBottom - outward,
      glassZ + forward,
    )
  }
  if (side === 'top') {
    return new THREE.Vector3(
      innerRight - along * glassWidth,
      innerTop + outward,
      glassZ + forward,
    )
  }
  if (side === 'right') {
    return new THREE.Vector3(
      innerRight + outward,
      innerBottom + along * glassHeight,
      glassZ + forward,
    )
  }
  return new THREE.Vector3(
    innerLeft - outward,
    innerTop - along * glassHeight,
    glassZ + forward,
  )
}

/** Sweeps the chrome profile around the glass opening. */
export const createGlassFrameGeometry = (): ThreeBufferGeometry => {
  const sides: ReadonlyArray<'bottom' | 'right' | 'top' | 'left'> = [
    'bottom',
    'right',
    'top',
    'left',
  ]
  const lengthSegments = 24
  const positions: Array<number> = []
  const normals: Array<number> = []
  const uvs: Array<number> = []
  const indices: Array<number> = []
  const rings: Array<Array<number>> = []

  for (const side of sides) {
    for (let segment = 0; segment <= lengthSegments; segment += 1) {
      const along = segment / lengthSegments
      const ring: Array<number> = []
      for (const [profileIndex, sample] of profilePoints.entries()) {
        const point = framePoint(side, along, sample.x, sample.z)
        const outward = framePoint(side, along, sample.x + 0.01, sample.z)
        const alongPoint = framePoint(side, along + 0.02, sample.x, sample.z)
        const tangent = alongPoint.sub(point).normalize()
        const outDir = outward.sub(point).normalize()
        const normal = new THREE.Vector3()
          .crossVectors(tangent, outDir)
          .normalize()
        if (normal.lengthSq() < 0.0001) {
          normal.set(0, 0, 1)
        }
        const u = (sides.indexOf(side) + along) / 4
        const v = profileIndex / Math.max(1, profilePoints.length - 1)
        ring.push(pushVertex(positions, normals, uvs, point, normal, u, v))
      }
      rings.push(ring)
    }
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const current = rings.at(ringIndex)
    const next = rings.at(ringIndex + 1)
    if (current === undefined || next === undefined) {
      continue
    }
    for (
      let profileIndex = 0;
      profileIndex < profilePoints.length - 1;
      profileIndex += 1
    ) {
      const a = current.at(profileIndex)
      const b = current.at(profileIndex + 1)
      const c = next.at(profileIndex)
      const d = next.at(profileIndex + 1)
      if (
        a === undefined ||
        b === undefined ||
        c === undefined ||
        d === undefined
      ) {
        continue
      }
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const slotForMass = (mass: MassBox): MaterialSlot => {
  if (mass.role === 'Booth') {
    return 'booth'
  }
  if (mass.role === 'Kick') {
    return 'interior'
  }
  return 'paintedSteel'
}

/** Emits static cabinet and booth meshes from the plan. */
export const compileStaticGeometry = (
  plan: CabinetPlan,
): {
  geometries: Map<MaterialSlot, ThreeBufferGeometry>
  reports: ReturnType<ReturnType<typeof createMeshWriter>['reports']>
  triangleCount: number
} => {
  const writer = createMeshWriter()
  for (const mass of plan.masses) {
    writer.appendBox(slotForMass(mass), mass.id, mass.center, mass.size)
  }
  const interiorShelves = plan.placements.filter(item => item.kind === 'Shelf')
  for (const shelf of interiorShelves) {
    writer.appendBox('interior', shelf.id, shelf.center, shelf.size)
  }
  const geometries = writer.compile()
  return {
    geometries,
    reports: writer.reports(),
    triangleCount: writer.triangleCount(),
  }
}

/** Builds a box mesh for a live placement. */
export const placementBoxGeometry = (
  placement: KitPlacement,
): ThreeBoxGeometry =>
  new THREE.BoxGeometry(placement.size.x, placement.size.y, placement.size.z)
