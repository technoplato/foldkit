import {
  Effect,
  Function,
  Option,
  Schema as S,
  SchemaTransformation,
} from 'effect'

import {
  InstantLogMessageRecord,
  encodedOfTagColumn,
  snapshotLogMessageWire,
  tagColumnOf,
} from '@foldkit/instant/snapshot-log'

import { App } from './app.js'
import { JumpToChapter } from './message.js'

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

const LegacyJumpToChapter = S.Struct({
  _tag: S.Literal(JumpToChapter.tag),
  chapterNumber: S.Int.check(S.isGreaterThanOrEqualTo(1)),
})

const normalizedLegacyRow = (
  row: InstantLogMessageRecord,
): InstantLogMessageRecord =>
  Option.match(
    Option.flatMap(encodedOfTagColumn(row.tag), candidate =>
      'chapterId' in candidate
        ? Option.none()
        : S.decodeUnknownOption(LegacyJumpToChapter)(candidate),
    ),
    {
      onNone: () => row,
      onSome: ({ chapterNumber }) => ({
        ...row,
        tag: tagColumnOf({
          _tag: JumpToChapter.tag,
          chapterId: `legacy-chapter-${chapterNumber.toString()}`,
        }),
      }),
    },
  )

const baseMessageWire = snapshotLogMessageWire(App.Message)

/**
 * Door from a log row to an App Message: `Play:{"slug":"the-lantern-keeper"}`.
 * Legacy `JumpToChapter:{"chapterNumber":N}` log rows written before chapters
 * carried stable ids decode cleanly so historical sync logs still fold. An
 * unknown tag or malformed payload still fails to decode instead of becoming
 * a guess.
 */
export const MessageWire = InstantLogMessageRecord.pipe(
  S.decodeTo(
    baseMessageWire,
    SchemaTransformation.transform({
      decode: normalizedLegacyRow,
      encode: Function.identity,
    }),
  ),
)
