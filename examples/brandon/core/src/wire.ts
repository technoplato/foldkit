import { Effect, Schema as S, SchemaTransformation } from 'effect'

import {
  countSnapshotId,
  snapshotLogMessageWire,
} from '@foldkit/instant/snapshot-log'

import { LogMessage } from './message.js'
import { Model, initialModel } from './model.js'

/**
 * The snapshot row a tape keeps beside the log. Brandon dot boots by
 * folding the log, so the row only counts players; decoding always starts
 * from the initial Model.
 */
export const SnapshotRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const PlayersOnly = S.Struct({ players: S.Array(S.Unknown) })

/** Door from the snapshot row to the Model. */
export const Projection = SnapshotRow.pipe(
  S.decodeTo(
    Model,
    SchemaTransformation.transformOrFail({
      decode: () =>
        Effect.mapError(
          S.encodeUnknownEffect(Model)(initialModel),
          error => error.issue,
        ),
      encode: encoded =>
        Effect.map(
          Effect.mapError(
            S.decodeUnknownEffect(PlayersOnly)(encoded),
            error => error.issue,
          ),
          ({ players }) => ({
            id: countSnapshotId,
            value: players.length,
            asOf: '',
            at: 0,
          }),
        ),
    }),
  ),
)

/**
 * Door from a log row to a Message. A fact travels with its fields as
 * JSON. Only the log's own facts decode: a row carrying anything the
 * origin sends one person, or any other tag, fails instead of becoming a
 * guess.
 */
export const MessageWire = snapshotLogMessageWire(LogMessage)
