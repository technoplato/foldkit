import { Effect, Schema as S, SchemaTransformation } from 'effect'

import {
  countSnapshotId,
  snapshotLogMessageWire,
} from '@foldkit/instant/snapshot-log'

import { App } from './app.js'

const [initialModel] = App.init()

/**
 * The snapshot row a tape keeps beside the log. The Multiple Counters
 * boot by folding the log, so the row only records how many counters
 * there were; decoding always starts from the App's initial Model.
 */
export const ListRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})
/** The snapshot row a tape keeps beside the log. */
export type ListRow = typeof ListRow.Type

const CountersOnly = S.Struct({ counters: S.Array(S.Unknown) })

/** Door from the snapshot row to the App Model. */
export const ListProjection = ListRow.pipe(
  S.decodeTo(
    App.Model,
    SchemaTransformation.transformOrFail({
      decode: () =>
        Effect.mapError(
          S.encodeUnknownEffect(App.Model)(initialModel),
          error => error.issue,
        ),
      encode: encoded =>
        Effect.map(
          Effect.mapError(
            S.decodeUnknownEffect(CountersOnly)(encoded),
            error => error.issue,
          ),
          ({ counters }) => ({
            id: countSnapshotId,
            value: counters.length,
            asOf: '',
            at: 0,
          }),
        ),
    }),
  ),
)

/**
 * Door from a log row to an App Message. A row Action travels with its
 * fields as JSON, `GotCounterMessage:{"counterId":3,"message":{"_tag":"Increment"}}`,
 * and an unknown tag fails to decode instead of becoming a guess.
 */
export const MessageWire = snapshotLogMessageWire(App.Message)
