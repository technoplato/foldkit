import { Effect, Schema as S, SchemaTransformation } from 'effect'

import { snapshotLogMessageWire } from '@foldkit/instant/snapshot-log'

import { App } from './app.js'

const [initialModel] = App.init()

/**
 * The snapshot row a program log keeps beside its rows, in the shape every
 * log engine checks: `{ id, value, asOf, at }`. Books boot by folding the
 * log over the initial Model, and the shelf comes from the library store,
 * so the row carries nothing the Model needs.
 */
export const BooksRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})
/** The snapshot row a program log keeps beside its rows. */
export type BooksRow = typeof BooksRow.Type

/** Door from the snapshot row to the App Model: always the initial Model. */
export const BooksProjection = BooksRow.pipe(
  S.decodeTo(
    App.Model,
    SchemaTransformation.transformOrFail({
      decode: () =>
        Effect.mapError(
          S.encodeUnknownEffect(App.Model)(initialModel),
          error => error.issue,
        ),
      encode: () => Effect.succeed({ id: 'books', value: 0, asOf: '', at: 0 }),
    }),
  ),
)

/**
 * Door from a log row to an App Message: `Play:{"slug":"the-lantern-keeper"}`.
 * An unknown tag fails to decode instead of becoming a guess.
 */
export const MessageWire = snapshotLogMessageWire(App.Message)
