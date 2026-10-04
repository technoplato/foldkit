import { Effect, Schema as S, SchemaTransformation } from 'effect'

import {
  type InstantLogMessageRecord,
  snapshotLogMessageWire,
} from '@foldkit/instant/snapshot-log'

import { App, type AppMessage, type AppModel } from './app.js'

const [initialModel] = App.init()

/**
 * The snapshot row a program log keeps beside its rows, in the shape every
 * log engine checks: `{ id, value, asOf, at }`. Reminders boot by folding
 * the log over the initial Model, and the board comes from the store, so
 * the row carries nothing the Model needs.
 */
export const RemindersRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})
/** The snapshot row a program log keeps beside its rows. */
export type RemindersRow = typeof RemindersRow.Type

/** Door from the snapshot row to the App Model: always the initial Model. */
export const RemindersProjection: S.Codec<AppModel, RemindersRow> =
  RemindersRow.pipe(
    S.decodeTo(
      App.Model,
      SchemaTransformation.transformOrFail({
        decode: () =>
          Effect.mapError(
            S.encodeUnknownEffect(App.Model)(initialModel),
            error => error.issue,
          ),
        encode: () =>
          Effect.succeed({ id: 'reminders', value: 0, asOf: '', at: 0 }),
      }),
    ),
  )

/**
 * Door from a log row to an App Message:
 * `AddReminder:{"title":"Buy milk"}`. An unknown tag fails to decode
 * instead of becoming a guess.
 */
export const MessageWire: S.Codec<AppMessage, InstantLogMessageRecord> =
  snapshotLogMessageWire(App.Message)
