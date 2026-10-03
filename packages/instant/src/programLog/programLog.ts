import {
  Array,
  Effect,
  Option,
  Predicate,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
} from 'effect'

import { encodedOfTagColumn, tagColumnOf } from '../snapshotLog/messageWire.js'
import {
  InstantLogMessageRecord,
  type SnapshotLogQueryData,
  type SnapshotLogState,
  countSnapshotId,
  emptyCountSnapshotFor,
  snapshotLogPageSize,
  snapshotLogRecentRows,
  sortLogMessages,
} from '../snapshotLog/snapshotLog.js'

// ROW

/**
 * One Message on the shared program log, as Instant stores it: which app
 * wrote it, at which Program version, its tag, and its fields as JSON.
 *
 * @example
 * ```typescript
 * { id, app: 'multiple-counters', programVersion: 1, tag: 'Decrement',
 *   payload: { counterId: 2 }, from: 'react-4f2a9c1e', createdAtMs }
 * ```
 */
export const ProgramMessageRow = S.Struct({
  id: S.String,
  app: S.String,
  programVersion: S.Int,
  tag: S.String,
  payload: S.Record(S.String, S.Unknown),
  from: S.String,
  createdAtMs: S.Number,
})
/** One Message on the shared program log, as Instant stores it. */
export type ProgramMessageRow = typeof ProgramMessageRow.Type

// ENVELOPE

/**
 * The envelope between one app's rows on the shared log and the log record
 * the runtime reads. Decoding rejects a row another app wrote and keeps the
 * Program version; the Program's own Message Schema then decides whether
 * the tag and fields are a Message it accepts. Encoding splits a record's
 * tag column back into tag and payload and stamps the app.
 *
 * @example
 * ```typescript
 * S.decodeUnknownSync(programLogEnvelope('multiple-counters'))(row)
 * // { id, tag: 'Decrement:{"counterId":2}', programVersion: 1, from, createdAtMs }
 * ```
 */
export const programLogEnvelope = (app: string) =>
  ProgramMessageRow.pipe(
    S.decodeTo(
      InstantLogMessageRecord,
      SchemaTransformation.transformOrFail({
        decode: (row: ProgramMessageRow) =>
          row.app === app
            ? Effect.succeed({
                id: row.id,
                from: row.from,
                createdAtMs: row.createdAtMs,
                tag: tagColumnOf({ ...row.payload, _tag: row.tag }),
                programVersion: row.programVersion,
              })
            : Effect.fail(
                new SchemaIssue.InvalidValue(Option.some(row.app), {
                  message: `This row belongs to ${row.app}, not ${app}.`,
                }),
              ),
        encode: (record: InstantLogMessageRecord) =>
          Option.match(encodedOfTagColumn(record.tag), {
            onNone: () =>
              Effect.fail(
                new SchemaIssue.InvalidValue(Option.some(record.tag), {
                  message: 'The Message tag column has an unreadable payload.',
                }),
              ),
            onSome: ({ _tag, ...payload }) =>
              record.programVersion === undefined || !Predicate.isString(_tag)
                ? Effect.fail(
                    new SchemaIssue.InvalidValue(Option.some(record), {
                      message:
                        'A program log row needs a tag and a Program version.',
                    }),
                  )
                : Effect.succeed({
                    id: record.id,
                    app,
                    programVersion: record.programVersion,
                    tag: _tag,
                    payload,
                    from: record.from,
                    createdAtMs: record.createdAtMs,
                  }),
          }),
      }),
    ),
  )

// QUERY

/** Every row one app wrote to the shared log. */
export const programLogQuery = (app: string) =>
  ({ programMessage: { $: { where: { app } } } }) as const

/** One page of one app's rows in the order Instant received them. */
export const programLogPageQuery = (app: string, offset: number) =>
  ({
    programMessage: {
      $: {
        where: { app },
        limit: snapshotLogPageSize,
        offset,
        order: { serverCreatedAt: 'asc' },
      },
    },
  }) as const

/** The newest rows one app wrote, for the live feed. */
export const programLogRecentQuery = (app: string) =>
  ({
    programMessage: {
      $: {
        where: { app },
        limit: snapshotLogRecentRows,
        order: { serverCreatedAt: 'desc' },
      },
    },
  }) as const

// DECODE

/**
 * Decodes one row through an app's envelope. A row the envelope rejects
 * throws, so the transport reports a Decode failure instead of folding a
 * guess.
 */
export const decodeProgramMessageRow =
  (app: string) =>
  (row: unknown): InstantLogMessageRecord =>
    S.decodeUnknownSync(programLogEnvelope(app))(row)

/**
 * One app's rows as the log state the runtime reads. The shared log keeps
 * no snapshot row: every Processor boots by folding the log, so the state
 * carries an empty one.
 */
export const decodeProgramLogState =
  (app: string) =>
  (data: SnapshotLogQueryData): SnapshotLogState => ({
    messages: sortLogMessages(
      Array.map(data.programMessage ?? [], decodeProgramMessageRow(app)),
    ),
    snapshot: emptyCountSnapshotFor(countSnapshotId),
  })

/** The fields one record writes to the shared log for an app. */
export const programMessageFieldsOf = (
  app: string,
  record: InstantLogMessageRecord,
): Omit<ProgramMessageRow, 'id'> => {
  const { id: _id, ...fields } = S.encodeSync(programLogEnvelope(app))(record)
  return fields
}
