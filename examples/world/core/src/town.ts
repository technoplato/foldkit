import { Array, Option, Schema as S } from 'effect'
import * as Interactable from 'foldkit/interactable'
import { CardinalFacing, GridCoord, South, gridCoord } from 'foldkit/spatial'

/** Inclusive yard size. Fence occupies the outer ring. */
export const yardSize = 11

/** Inclusive last cell index. */
export const lastCell = yardSize - 1

/** Player spawn cell. */
export const spawnAt: GridCoord = gridCoord(5, 5)

/** Player spawn facing. */
export const spawnFacing: CardinalFacing = South()

/** Stable sign identity. */
export const SignId = S.Literals([
  'welcome',
  'clip',
  'knophy',
  'sol',
  'foldkit',
  'degree',
  'machine',
  'wallet',
])

/** Stable sign identity. */
export type SignId = typeof SignId.Type

/** One Pokemon-style town sign. Overlay text lives here, not as a boolean. */
export const Sign = S.Struct({
  id: SignId,
  speaker: S.String,
  post: S.String,
  overlay: S.String,
})

/** One Pokemon-style town sign. */
export type Sign = typeof Sign.Type

/** Vending machine cell. Stand beside it and press A. */
export const vendingId = 'vending'

/** Vending machine cell. */
export const vendingAt: GridCoord = gridCoord(7, 7)

/** Every town sign. Short post plus full overlay copy. */
export const signs: ReadonlyArray<Sign> = [
  Sign.make({
    id: 'welcome',
    speaker: 'WELCOME',
    post: 'Press A near things.',
    overlay: 'Press A near things. That is how you talk in this town.',
  }),
  Sign.make({
    id: 'clip',
    speaker: 'CLIP',
    post: 'SKU 1428. Listed $14.28.',
    overlay:
      'Sell TJ tortoise the clip. SKU 1428. Listed $14.28. Boomerang 1428.',
  }),
  Sign.make({
    id: 'knophy',
    speaker: 'KNOPHY',
    post: 'nofi, nofee, nophy.',
    overlay:
      'Voice garbles Knophy. If you hear nofi, nofee, or nophy, it means knophy.com.',
  }),
  Sign.make({
    id: 'sol',
    speaker: 'SOL',
    post: 'Devnet first. Stripe later.',
    overlay:
      'deposit.knophy.com takes SOL Devnet first. Stripe later. Capabilities unlock from a fiat or crypto ADT.',
  }),
  Sign.make({
    id: 'foldkit',
    speaker: 'FOLDKIT',
    post: 'One Program. Many views.',
    overlay:
      'One Program. Many views. TUI, Three.js, React, Foldkit. Core never renders.',
  }),
  Sign.make({
    id: 'degree',
    speaker: 'DEGREE',
    post: '3D plus software engineering.',
    overlay:
      'Pull this off and it is a degree in 3D programming and software engineering.',
  }),
  Sign.make({
    id: 'machine',
    speaker: 'MACHINE',
    post: 'Walk up. Press A. Enter 1428.',
    overlay:
      'Walk up to the machine. Press A. Enter 1428. Pay on Devnet. It vends.',
  }),
  Sign.make({
    id: 'wallet',
    speaker: 'WALLET',
    post: 'wallet.knophy.com is Devnet.',
    overlay: 'wallet.knophy.com is Devnet. No live money.',
  }),
]

/** Sign posts around the fence. */
export const signCells: ReadonlyArray<Readonly<{ id: SignId; at: GridCoord }>> =
  [
    { id: 'welcome', at: gridCoord(2, 1) },
    { id: 'clip', at: gridCoord(8, 1) },
    { id: 'knophy', at: gridCoord(1, 3) },
    { id: 'sol', at: gridCoord(9, 3) },
    { id: 'foldkit', at: gridCoord(1, 7) },
    { id: 'degree', at: gridCoord(9, 7) },
    { id: 'machine', at: gridCoord(2, 9) },
    { id: 'wallet', at: gridCoord(8, 9) },
  ]

/** Every interactable in the yard. */
export const entities: ReadonlyArray<Interactable.Entity> = [
  ...signCells.map(cell =>
    Interactable.Entity.make({
      id: cell.id,
      at: cell.at,
      kind: Interactable.SignKind(),
    }),
  ),
  Interactable.Entity.make({
    id: vendingId,
    at: vendingAt,
    kind: Interactable.MachineKind(),
  }),
]

/** True when the cell is on the outer fence ring. */
export const isFence = (coord: GridCoord): boolean =>
  coord.x === 0 || coord.z === 0 || coord.x === lastCell || coord.z === lastCell

/** True when the cell is inside the yard bounds. */
export const isInsideYard = (coord: GridCoord): boolean =>
  coord.x >= 0 && coord.z >= 0 && coord.x <= lastCell && coord.z <= lastCell

/** True when a walker can occupy the cell. */
export const isWalkable = (coord: GridCoord): boolean => {
  if (!isInsideYard(coord) || isFence(coord)) {
    return false
  }
  return Option.isNone(Interactable.entityAt(entities, coord))
}

/** Looks up a sign by id. */
export const signById = (id: string): Option.Option<Sign> =>
  Array.findFirst(signs, sign => sign.id === id)

/** Interact target for the cell the player faces. */
export const facingTarget = (
  at: GridCoord,
  facing: CardinalFacing,
): Interactable.InteractTarget =>
  Interactable.targetInFront(at, facing, entities)
