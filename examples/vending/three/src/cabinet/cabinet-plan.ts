import {
  backZ,
  clipShelfIndex,
  columnLeft,
  crownHeight,
  doorBottom,
  doorLeft,
  doorRight,
  doorTop,
  frontZ,
  glassBottom,
  glassLeft,
  glassRight,
  glassThickness,
  glassTop,
  glassZ,
  halfWidth,
  keypadBottom,
  keypadTop,
  kickHeight,
  ledBottom,
  ledTop,
  machineDepth,
  machineHeight,
  machineSeed,
  machineWidth,
  qrBottom,
  qrTop,
  shelfHeights,
  wallThickness,
} from './design-contract.js'
import type { MaterialSlot } from './mesh-writer.js'

export type MassRole =
  | 'Shell'
  | 'Crown'
  | 'Kick'
  | 'Column'
  | 'GlassBay'
  | 'DoorBay'
  | 'Booth'

export type MassBox = Readonly<{
  id: string
  role: MassRole
  center: Readonly<{ x: number; y: number; z: number }>
  size: Readonly<{ x: number; y: number; z: number }>
}>

export type PlacementKind =
  | 'Glass'
  | 'ChromeFrame'
  | 'LedDisplay'
  | 'Keypad'
  | 'QrPanel'
  | 'Door'
  | 'Shelf'
  | 'Clip'
  | 'LedStrip'
  | 'Jewel'
  | 'Brand'
  | 'PricePlate'

export type KitPlacement = Readonly<{
  id: string
  kind: PlacementKind
  slot: MaterialSlot | 'glass' | 'led' | 'product'
  center: Readonly<{ x: number; y: number; z: number }>
  size: Readonly<{ x: number; y: number; z: number }>
}>

export type CabinetPlan = Readonly<{
  seed: number
  masses: ReadonlyArray<MassBox>
  placements: ReadonlyArray<KitPlacement>
  diagnostics: Readonly<{
    massCount: number
    placementCount: number
    shelfCount: number
    clipShelf: number
  }>
}>

const box = (
  id: string,
  role: MassRole,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): MassBox => ({
  id,
  role,
  center: {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    z: (z0 + z1) / 2,
  },
  size: {
    x: x1 - x0,
    y: y1 - y0,
    z: z1 - z0,
  },
})

const place = (
  id: string,
  kind: PlacementKind,
  slot: KitPlacement['slot'],
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): KitPlacement => ({
  id,
  kind,
  slot,
  center: {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    z: (z0 + z1) / 2,
  },
  size: {
    x: x1 - x0,
    y: y1 - y0,
    z: z1 - z0,
  },
})

/** Builds the inspectable cabinet plan before triangle emission. */
export const createCabinetPlan = (): CabinetPlan => {
  const innerLeft = -halfWidth + wallThickness
  const innerRight = halfWidth - wallThickness
  const innerBack = backZ + wallThickness
  const innerFront = frontZ - wallThickness
  const crownBottom = machineHeight - crownHeight
  const masses: Array<MassBox> = [
    box(
      'left-wall',
      'Shell',
      -halfWidth,
      innerLeft,
      0,
      machineHeight,
      backZ,
      frontZ,
    ),
    box(
      'right-wall',
      'Shell',
      innerRight,
      halfWidth,
      0,
      machineHeight,
      backZ,
      frontZ,
    ),
    box(
      'back-wall',
      'Shell',
      innerLeft,
      innerRight,
      0,
      machineHeight,
      backZ,
      innerBack,
    ),
    box(
      'top-cap',
      'Shell',
      innerLeft,
      innerRight,
      machineHeight - wallThickness,
      machineHeight,
      innerBack,
      frontZ,
    ),
    box(
      'floor-pan',
      'Shell',
      innerLeft,
      innerRight,
      0,
      wallThickness,
      innerBack,
      frontZ,
    ),
    box(
      'left-stile',
      'Shell',
      innerLeft,
      glassLeft,
      kickHeight,
      crownBottom,
      innerFront,
      frontZ,
    ),
    box(
      'glass-top-rail',
      'Shell',
      glassLeft,
      columnLeft,
      glassTop,
      crownBottom,
      innerFront,
      frontZ,
    ),
    box(
      'glass-sill',
      'Shell',
      glassLeft,
      columnLeft,
      doorTop,
      glassBottom,
      innerFront,
      frontZ,
    ),
    box(
      'door-left-stile',
      'DoorBay',
      glassLeft,
      doorLeft,
      kickHeight,
      doorTop,
      innerFront,
      frontZ,
    ),
    box(
      'door-right-stile',
      'DoorBay',
      doorRight,
      columnLeft,
      kickHeight,
      doorTop,
      innerFront,
      frontZ,
    ),
    box(
      'kick',
      'Kick',
      -halfWidth + 0.01,
      halfWidth - 0.01,
      0,
      kickHeight,
      frontZ - 0.02,
      frontZ + 0.012,
    ),
    box(
      'crown',
      'Crown',
      -halfWidth,
      halfWidth,
      crownBottom,
      machineHeight,
      frontZ - 0.03,
      frontZ + 0.028,
    ),
    box(
      'glass-column-mullion',
      'Column',
      glassRight,
      columnLeft,
      kickHeight,
      crownBottom,
      innerFront,
      frontZ,
    ),
    box(
      'column-front',
      'Column',
      columnLeft,
      innerRight,
      kickHeight,
      crownBottom,
      innerFront,
      frontZ,
    ),
    box('booth-floor', 'Booth', -1.8, 1.8, -0.02, 0, -1.7, 2.4),
    box('booth-back', 'Booth', -1.8, 1.8, 0, 3, -1.72, -1.64),
    box('booth-left', 'Booth', -1.84, -1.76, 0, 3, -1.7, 1.1),
    box('booth-right', 'Booth', 1.76, 1.84, 0, 3, -1.7, 1.1),
  ]

  const placements: Array<KitPlacement> = [
    place(
      'glass',
      'Glass',
      'glass',
      glassLeft + 0.006,
      glassRight - 0.006,
      glassBottom + 0.006,
      glassTop - 0.006,
      glassZ - glassThickness / 2,
      glassZ + glassThickness / 2,
    ),
    place(
      'chrome-frame',
      'ChromeFrame',
      'chrome',
      glassLeft,
      glassRight,
      glassBottom,
      glassTop,
      glassZ - 0.01,
      glassZ + 0.012,
    ),
    place(
      'led-display',
      'LedDisplay',
      'led',
      columnLeft + 0.03,
      halfWidth - 0.07,
      ledBottom,
      ledTop,
      frontZ + 0.002,
      frontZ + 0.012,
    ),
    place(
      'keypad',
      'Keypad',
      'rubber',
      columnLeft + 0.04,
      halfWidth - 0.08,
      keypadBottom,
      keypadTop,
      frontZ + 0.004,
      frontZ + 0.02,
    ),
    place(
      'qr-panel',
      'QrPanel',
      'led',
      columnLeft + 0.05,
      halfWidth - 0.09,
      qrBottom,
      qrTop,
      frontZ + 0.002,
      frontZ + 0.008,
    ),
    place(
      'door',
      'Door',
      'paintedSteel',
      doorLeft,
      doorRight,
      doorBottom,
      doorTop,
      frontZ - 0.01,
      frontZ + 0.016,
    ),
    place(
      'jewel',
      'Jewel',
      'led',
      columnLeft + 0.06,
      columnLeft + 0.1,
      ledTop + 0.03,
      ledTop + 0.07,
      frontZ + 0.01,
      frontZ + 0.018,
    ),
    place(
      'brand',
      'Brand',
      'paintedSteel',
      -0.36,
      0.36,
      crownBottom + 0.04,
      machineHeight - 0.03,
      frontZ + 0.029,
      frontZ + 0.031,
    ),
    place(
      'price-plate',
      'PricePlate',
      'chrome',
      columnLeft + 0.04,
      halfWidth - 0.08,
      ledBottom - 0.07,
      ledBottom - 0.02,
      frontZ + 0.002,
      frontZ + 0.008,
    ),
    place(
      'led-left',
      'LedStrip',
      'led',
      glassLeft + 0.012,
      glassLeft + 0.02,
      glassBottom + 0.04,
      glassTop - 0.04,
      innerFront + 0.02,
      innerFront + 0.028,
    ),
    place(
      'led-right',
      'LedStrip',
      'led',
      glassRight - 0.02,
      glassRight - 0.012,
      glassBottom + 0.04,
      glassTop - 0.04,
      innerFront + 0.02,
      innerFront + 0.028,
    ),
  ]

  for (const [index, shelfY] of shelfHeights.entries()) {
    placements.push(
      place(
        `shelf-${index}`,
        'Shelf',
        'interior',
        innerLeft + 0.01,
        columnLeft - 0.02,
        shelfY - 0.01,
        shelfY + 0.01,
        innerBack + 0.02,
        innerFront - 0.04,
      ),
    )
  }

  const clipShelfY = shelfHeights.at(clipShelfIndex)
  if (clipShelfY !== undefined) {
    placements.push(
      place(
        'clip',
        'Clip',
        'product',
        -0.18,
        -0.05,
        clipShelfY + 0.012,
        clipShelfY + 0.04,
        -0.04,
        0.06,
      ),
    )
  }

  return {
    seed: machineSeed,
    masses,
    placements,
    diagnostics: {
      massCount: masses.length,
      placementCount: placements.length,
      shelfCount: shelfHeights.length,
      clipShelf: clipShelfIndex,
    },
  }
}

/** Finds the first placement of a kind. */
export const placementOf = (
  plan: CabinetPlan,
  kind: PlacementKind,
): KitPlacement => {
  const found = plan.placements.find(item => item.kind === kind)
  if (found === undefined) {
    throw new Error(`missing placement ${kind}`)
  }
  return found
}

export { machineDepth, machineWidth }
