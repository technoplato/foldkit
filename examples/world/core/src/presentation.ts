import { Array, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'
import { type GridCoord, equalCoord, gridCoord } from 'foldkit/spatial'
import type { Model as VendingModel } from 'vending-core-example'

import { type Model } from './model.js'
import {
  entities,
  isFence,
  lastCell,
  signs,
  vendingAt,
  yardSize,
} from './town.js'

/** No overlay is open. */
export const HiddenOverlay = ts('Hidden')

/** A sign overlay owns the screen. */
export const SignOverlay = ts('SignOverlay', {
  speaker: S.String,
  post: S.String,
  overlay: S.String,
})

/** The nested vending menu owns the screen. */
export const VendingOverlay = ts('VendingOverlay', {
  keypadBuffer: S.String,
  vendPhase: S.String,
  listPriceDisplay: S.String,
})

/** Derived overlay. Never stored beside a walking flag. */
export const Overlay = S.Union([HiddenOverlay, SignOverlay, VendingOverlay])

/** Derived overlay. */
export type Overlay = typeof Overlay.Type

/** One painted town cell. */
export const TownCell = S.Struct({
  x: S.Int,
  z: S.Int,
  glyph: S.String,
})

/** One painted town cell. */
export type TownCell = typeof TownCell.Type

const glyphFor = (at: GridCoord, walker: GridCoord): string => {
  if (equalCoord(at, walker)) {
    return '@'
  }
  if (equalCoord(at, vendingAt)) {
    return 'V'
  }
  if (isFence(at)) {
    return '#'
  }
  const maybeEntity = Array.findFirst(entities, entity =>
    equalCoord(entity.at, at),
  )
  if (Option.isSome(maybeEntity) && maybeEntity.value.kind._tag === 'Sign') {
    return '!'
  }
  return '.'
}

const axis = Array.range(0, lastCell)

/** Builds the 2D town cells for HTML, React, and ASCII clients. */
export const townCells = (model: Model): ReadonlyArray<TownCell> =>
  Array.flatMap(axis, z =>
    Array.map(axis, x =>
      TownCell.make({
        x,
        z,
        glyph: glyphFor(gridCoord(x, z), model.at),
      }),
    ),
  )

/** Builds ASCII rows for the TUI and headless receipt. */
export const asciiMap = (model: Model): string =>
  Array.map(axis, z =>
    Array.map(axis, x => glyphFor(gridCoord(x, z), model.at)).join(''),
  ).join('\n')

/** Yard width for clients that paint a square grid. */
export const townWidth = yardSize

/** Derives the exclusive overlay from World attention. */
export const overlayOf = (model: Model): Overlay =>
  M.value(model).pipe(
    M.tagsExhaustive({
      Roaming: () => HiddenOverlay(),
      Reading: ({ sign }) =>
        SignOverlay({
          speaker: sign.speaker,
          post: sign.post,
          overlay: sign.overlay,
        }),
      Operating: ({ vending }) =>
        VendingOverlay({
          keypadBuffer: vending.keypadBuffer,
          vendPhase: vending.vendPhase._tag,
          listPriceDisplay: vending.listPriceDisplay,
        }),
    }),
  )

/** Projects a compact vending snapshot for hosts that need more than glyphs. */
export const vendingOf = (model: Model): Option.Option<VendingModel> => {
  if (model._tag === 'Operating') {
    return Option.some(model.vending)
  }
  return Option.none()
}

/** Sign catalog for clients that paint posts from data. */
export const signCatalog = signs
