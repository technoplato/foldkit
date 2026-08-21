import { Array, Function, Match as M, Option, Schema as S } from 'effect'

import { ts } from '../schema/index.js'
import {
  type CardinalFacing,
  GridCoord,
  type GridCoord as GridCoordType,
  equalCoord,
  inFront,
} from '../spatial/spatial.js'

/** No interactable occupies the faced cell. */
export const None = ts('None')

/** The faced cell holds an interactable with this id. */
export const Adjacent = ts('Adjacent', { id: S.String })

/** Exclusive interact target. Press A is only defined for `Adjacent`. */
export const InteractTarget = S.Union([None, Adjacent])

/** Exclusive interact target. */
export type InteractTarget = typeof InteractTarget.Type

/** A readable sign. */
export const SignKind = ts('Sign')

/** A machine the player can operate. */
export const MachineKind = ts('Machine')

/** A non-player character. */
export const NpcKind = ts('Npc')

/** Extensible interactable kind. Add variants with `S.Union` at the app layer. */
export const Kind = S.Union([SignKind, MachineKind, NpcKind])

/** Extensible interactable kind. */
export type Kind = typeof Kind.Type

/** One placed interactable on the grid. */
export const Entity = S.Struct({
  id: S.String,
  at: GridCoord,
  kind: Kind,
})

/** One placed interactable on the grid. */
export type Entity = typeof Entity.Type

/** Looks up the first entity on `coord`. */
export const entityAt = (
  entities: ReadonlyArray<Entity>,
  coord: GridCoordType,
): Option.Option<Entity> =>
  Array.findFirst(entities, entity => equalCoord(entity.at, coord))

/** Builds the interact target for the cell in front of the player. */
export const targetInFront = (
  at: GridCoordType,
  facing: CardinalFacing,
  entities: ReadonlyArray<Entity>,
): InteractTarget => {
  const maybeEntity = entityAt(entities, inFront(at, facing))
  if (Option.isSome(maybeEntity)) {
    return Adjacent({ id: maybeEntity.value.id })
  }
  return None()
}

/** Looks up an entity by id. */
export const entityById = (
  entities: ReadonlyArray<Entity>,
  id: string,
): Option.Option<Entity> =>
  Array.findFirst(entities, entity => entity.id === id)

/**
 * Applies Press A. `onNone` is required so a miss stays a typed no-op.
 * There is no Press A constructor for `None`.
 */
export const applyPressA: {
  <A, B = A>(handlers: {
    readonly onNone: Function.LazyArg<A>
    readonly onAdjacent: (id: string) => B
  }): (target: InteractTarget) => A | B
  <A, B = A>(
    target: InteractTarget,
    handlers: {
      readonly onNone: Function.LazyArg<A>
      readonly onAdjacent: (id: string) => B
    },
  ): A | B
} = ((
  targetOrHandlers:
    | InteractTarget
    | {
        readonly onNone: Function.LazyArg<unknown>
        readonly onAdjacent: (id: string) => unknown
      },
  maybeHandlers?: {
    readonly onNone: Function.LazyArg<unknown>
    readonly onAdjacent: (id: string) => unknown
  },
) => {
  if (maybeHandlers === undefined) {
    const handlers = targetOrHandlers as {
      readonly onNone: Function.LazyArg<unknown>
      readonly onAdjacent: (id: string) => unknown
    }
    return (target: InteractTarget) => applyPressA(target, handlers)
  }
  return M.value(targetOrHandlers as InteractTarget).pipe(
    M.tagsExhaustive({
      None: maybeHandlers.onNone,
      Adjacent: ({ id }) => maybeHandlers.onAdjacent(id),
    }),
  )
}) as typeof applyPressA

/** Press A payload that can exist only when a target is adjacent. */
export const PressA = ts('PressA', { id: S.String })

/** Press A payload that can exist only when a target is adjacent. */
export type PressA = typeof PressA.Type

/** Builds Press A only from an adjacent target. */
export const pressAFromTarget = (
  target: InteractTarget,
): Option.Option<PressA> =>
  applyPressA(target, {
    onNone: () => Option.none(),
    onAdjacent: id => Option.some(PressA({ id })),
  })
