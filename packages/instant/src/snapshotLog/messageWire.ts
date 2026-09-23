import {
  Array,
  Effect,
  Option,
  Predicate,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
  String,
  pipe,
} from 'effect'

import { InstantLogMessageRecord } from './snapshotLog.js'

const payloadSeparator = ':'

/**
 * Prints one encoded Message as the Instant `tag` column. A payload-free
 * Message prints its bare tag, so Swift and Rust readers that match on
 * `Increment` keep working. A Message with fields appends them as JSON.
 *
 * @example
 * ```typescript
 * tagColumnOf({ _tag: 'Increment' }) // 'Increment'
 * tagColumnOf({ _tag: 'ChangedActionMenuQuery', query: 're' })
 * // 'ChangedActionMenuQuery:{"query":"re"}'
 * ```
 */
export const tagColumnOf = (
  encoded: Readonly<{ _tag: string }> & Readonly<Record<string, unknown>>,
): string => {
  const { _tag, ...fields } = encoded
  if (Array.isReadonlyArrayEmpty(Object.keys(fields))) {
    return _tag
  }
  return `${_tag}${payloadSeparator}${JSON.stringify(fields)}`
}

const parseJsonObject = (
  json: string,
): Option.Option<Readonly<Record<string, unknown>>> =>
  pipe(
    Option.liftThrowable((text: string): unknown => JSON.parse(text))(json),
    Option.filter(Predicate.isObject),
  )

/**
 * Parses the Instant `tag` column back into an encoded Message candidate.
 * None when the payload is not a JSON object. The Program's Message Schema
 * still decides whether the candidate is a Message it accepts.
 *
 * @example
 * ```typescript
 * encodedOfTagColumn('Increment') // Some({ _tag: 'Increment' })
 * encodedOfTagColumn('Reset:not json') // None
 * ```
 */
export const encodedOfTagColumn = (
  column: string,
): Option.Option<Readonly<Record<string, unknown>>> =>
  Option.match(String.indexOf(payloadSeparator)(column), {
    onNone: () => Option.some({ _tag: column }),
    onSome: separatorIndex =>
      pipe(
        parseJsonObject(column.slice(separatorIndex + 1)),
        Option.map(fields => ({
          ...fields,
          _tag: column.slice(0, separatorIndex),
        })),
      ),
  })

/**
 * The Instant Message-log row for any Program's Message Schema. Decoding
 * fails closed: an unknown tag or an unreadable payload is a decode
 * failure, never a guessed Message.
 *
 * @example
 * ```typescript
 * const MessageWire = snapshotLogMessageWire(App.Message)
 * ```
 */
export const snapshotLogMessageWire = <Message extends S.Top>(
  Message: Message,
) =>
  InstantLogMessageRecord.pipe(
    S.decodeTo(
      Message,
      SchemaTransformation.transformOrFail({
        decode: (row: InstantLogMessageRecord) =>
          Option.match(encodedOfTagColumn(row.tag), {
            onNone: () =>
              Effect.fail(
                new SchemaIssue.InvalidValue(Option.some(row.tag), {
                  message: 'The Message tag column has an unreadable payload.',
                }),
              ),
            onSome: candidate =>
              Effect.succeed(candidate as Message['Encoded']),
          }),
        encode: (encoded: Message['Encoded']) => {
          if (
            Predicate.isObject(encoded) &&
            Predicate.isString(encoded['_tag'])
          ) {
            return Effect.succeed({
              id: '',
              tag: tagColumnOf({ ...encoded, _tag: encoded['_tag'] }),
              from: '',
              createdAtMs: 0,
            })
          } else {
            return Effect.fail(
              new SchemaIssue.InvalidValue(Option.some(encoded), {
                message: 'Only tagged Messages can be written to the log.',
              }),
            )
          }
        },
      }),
    ),
  )
