import { Schema as S, SchemaTransformation } from 'effect'

import { Decrement, Increment, Message, Reset } from './message.js'
import { Model } from './model.js'

/**
 * Instant entity id for the one count snapshot row.
 * Instant requires a UUID. This constant is that one row.
 */
export const COUNT_UUID = 'c0a7c001-0000-4000-8000-000000000001'

/** Instant count row. `asOf` and `at` are filled at write time. */
export const CountRow = S.Struct({
  id: S.Literal(COUNT_UUID),
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})
/** Instant count row. `asOf` and `at` are filled at write time. */
export type CountRow = typeof CountRow.Type

/**
 * Door from an Instant count row to the Counter Model.
 * Counter V0.1 projects the whole `{ count }`.
 */
export const CountProjection = CountRow.pipe(
  S.decodeTo(
    Model,
    SchemaTransformation.transform({
      decode: row => Model.make({ count: row.value }),
      encode: model => ({
        id: COUNT_UUID,
        value: model.count,
        asOf: '',
        at: 0,
      }),
    }),
  ),
)

/** Instant Message row. `id`, `from`, and `createdAtMs` are filled at write time. */
export const MessageRow = S.Struct({
  id: S.String,
  tag: S.Literals(['Increment', 'Decrement', 'Reset']),
  from: S.String,
  createdAtMs: S.Number,
})
/** Instant Message row. `id`, `from`, and `createdAtMs` are filled at write time. */
export type MessageRow = typeof MessageRow.Type

const messageFromTag = (tag: MessageRow['tag']): Message => {
  if (tag === 'Increment') {
    return Increment()
  }
  if (tag === 'Decrement') {
    return Decrement()
  }
  return Reset()
}

/** Door from an Instant Message row to a Counter Message. */
export const MessageWire = MessageRow.pipe(
  S.decodeTo(
    Message,
    SchemaTransformation.transform({
      decode: row => messageFromTag(row.tag),
      encode: message => ({
        id: '',
        tag: message._tag,
        from: '',
        createdAtMs: 0,
      }),
    }),
  ),
)
