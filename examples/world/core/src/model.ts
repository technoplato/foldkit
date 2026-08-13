import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'
import { CardinalFacing, GridCoord } from 'foldkit/spatial'
import { Model as VendingModel } from 'vending-core-example'

import { Sign } from './town.js'

/** Walking the yard. No overlay owns input. */
export const Roaming = ts('Roaming', {
  at: GridCoord,
  facing: CardinalFacing,
})

/** Reading a sign. Walking is closed. */
export const Reading = ts('Reading', {
  at: GridCoord,
  facing: CardinalFacing,
  sign: Sign,
})

/** Operating the nested Vending Program. Walking is closed. */
export const Operating = ts('Operating', {
  at: GridCoord,
  facing: CardinalFacing,
  vending: VendingModel,
})

/**
 * World attention is a tagged union. Roaming plus Reading is unrepresentable.
 * Pose lives on every variant so a dismiss keeps the same cell and facing.
 */
export const Model = S.Union([Roaming, Reading, Operating])

/** World attention is a tagged union. */
export type Model = typeof Model.Type

/** Shared pose carried by every World variant. */
export const poseOf = (
  model: Model,
): Readonly<{ at: typeof GridCoord.Type; facing: CardinalFacing }> => ({
  at: model.at,
  facing: model.facing,
})
