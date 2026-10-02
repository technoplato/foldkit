import { Effect, Schema as S, SchemaTransformation } from 'effect'

import {
  countSnapshotId,
  snapshotLogMessageWire,
} from '@foldkit/instant/snapshot-log'

import { App } from './app.js'

const CountOnly = S.Struct({ count: S.Number })

const [initialModel] = App.init()

/**
 * The Instant count row. `asOf` and `at` are filled at write time. Rows
 * written before the canonical Counter may carry extra occupancy columns;
 * decoding ignores them.
 */
export const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})
/** The Instant count row. */
export type CountRow = typeof CountRow.Type

/**
 * Door from the Instant count row to the App Model. Only the count travels,
 * so counter-swift and the Rust reader keep their wire. Decoding starts
 * from the App's initial Model, so every Destination a combinator adds is
 * covered without listing it here. Boot folds the Message log, not this
 * row, so the session and navigation it would reset come from the log
 * instead.
 */
export const CountProjection = CountRow.pipe(
  S.decodeTo(
    App.Model,
    SchemaTransformation.transformOrFail({
      decode: row =>
        Effect.mapError(
          S.encodeUnknownEffect(App.Model)({
            ...initialModel,
            count: row.value,
          }),
          error => error.issue,
        ),
      encode: encoded =>
        Effect.map(
          Effect.mapError(
            S.decodeUnknownEffect(CountOnly)(encoded),
            error => error.issue,
          ),
          ({ count }) => ({
            id: countSnapshotId,
            value: count,
            asOf: '',
            at: 0,
          }),
        ),
    }),
  ),
)

/**
 * Door from an Instant Message row to an App Message. `Increment` travels as
 * the bare tag counter-swift reads; menu Messages carry their fields as
 * JSON. An unknown tag fails to decode instead of becoming a guess.
 */
export const MessageWire = snapshotLogMessageWire(App.Message)
