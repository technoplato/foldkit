import * as THREE from 'three'

import type { ThreeBufferGeometry } from '../three-compat.js'
import { paintTileMetres } from './design-contract.js'

/** Semantic material slot compiled into one geometry. */
export type MaterialSlot =
  | 'paintedSteel'
  | 'chrome'
  | 'interior'
  | 'rubber'
  | 'booth'

export type TriangleReport = Readonly<{
  part: string
  slot: MaterialSlot
  triangles: number
}>

type SlotBuffer = {
  positions: Array<number>
  normals: Array<number>
  uvs: Array<number>
  indices: Array<number>
}

const createBuffer = (): SlotBuffer => ({
  positions: [],
  normals: [],
  uvs: [],
  indices: [],
})

const faceDescriptors: ReadonlyArray<
  Readonly<{
    normal: Readonly<[number, number, number]>
    corners: ReadonlyArray<Readonly<[number, number, number]>>
    uAxis: Readonly<[number, number, number]>
    vAxis: Readonly<[number, number, number]>
  }>
> = [
  {
    normal: [0, 0, 1],
    corners: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
  },
  {
    normal: [0, 0, -1],
    corners: [
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
    ],
    uAxis: [-1, 0, 0],
    vAxis: [0, 1, 0],
  },
  {
    normal: [1, 0, 0],
    corners: [
      [0.5, -0.5, 0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
    ],
    uAxis: [0, 0, -1],
    vAxis: [0, 1, 0],
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
    ],
    uAxis: [0, 0, 1],
    vAxis: [0, 1, 0],
  },
  {
    normal: [0, 1, 0],
    corners: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, -1],
  },
  {
    normal: [0, -1, 0],
    corners: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
  },
]

/** Compiles boxes into one BufferGeometry per material slot. */
export const createMeshWriter = () => {
  const slots = new Map<MaterialSlot, SlotBuffer>()
  const reports: Array<TriangleReport> = []

  const bufferFor = (slot: MaterialSlot): SlotBuffer => {
    const existing = slots.get(slot)
    if (existing !== undefined) {
      return existing
    }
    const created = createBuffer()
    slots.set(slot, created)
    return created
  }

  const appendBox = (
    slot: MaterialSlot,
    part: string,
    center: Readonly<{ x: number; y: number; z: number }>,
    size: Readonly<{ x: number; y: number; z: number }>,
  ): void => {
    const buffer = bufferFor(slot)
    const base = buffer.positions.length / 3
    for (const face of faceDescriptors) {
      const [nx, ny, nz] = face.normal
      const uSpan =
        Math.abs(face.uAxis[0]) * size.x +
        Math.abs(face.uAxis[1]) * size.y +
        Math.abs(face.uAxis[2]) * size.z
      const vSpan =
        Math.abs(face.vAxis[0]) * size.x +
        Math.abs(face.vAxis[1]) * size.y +
        Math.abs(face.vAxis[2]) * size.z
      for (const corner of face.corners) {
        const [lx, ly, lz] = corner
        buffer.positions.push(
          center.x + lx * size.x,
          center.y + ly * size.y,
          center.z + lz * size.z,
        )
        buffer.normals.push(nx, ny, nz)
        const u =
          ((lx * face.uAxis[0] +
            ly * face.uAxis[1] +
            lz * face.uAxis[2] +
            0.5) *
            uSpan) /
          paintTileMetres
        const v =
          ((lx * face.vAxis[0] +
            ly * face.vAxis[1] +
            lz * face.vAxis[2] +
            0.5) *
            vSpan) /
          paintTileMetres
        buffer.uvs.push(u, v)
      }
      const first = base + (buffer.positions.length / 3 - base) - 4
      buffer.indices.push(
        first,
        first + 1,
        first + 2,
        first,
        first + 2,
        first + 3,
      )
    }
    reports.push({ part, slot, triangles: 12 })
  }

  const compile = (): Map<MaterialSlot, ThreeBufferGeometry> => {
    const geometries = new Map<MaterialSlot, ThreeBufferGeometry>()
    for (const [slot, buffer] of slots) {
      if (buffer.indices.length === 0) {
        continue
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(buffer.positions, 3),
      )
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(buffer.normals, 3),
      )
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(buffer.uvs, 2),
      )
      geometry.setIndex(buffer.indices)
      geometries.set(slot, geometry)
    }
    return geometries
  }

  return {
    appendBox,
    compile,
    reports: (): ReadonlyArray<TriangleReport> => reports,
    triangleCount: (): number =>
      reports.reduce((sum, report) => sum + report.triangles, 0),
  }
}

export type MeshWriter = ReturnType<typeof createMeshWriter>
