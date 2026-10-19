import { Array, Option, Order, Record, Schema as S, pipe } from 'effect'

import { type Issue, type IssueMention } from '@foldkit/instant-tools/issues'

const WORDS_ORIGIN = 'https://words.pisspoursoftware.xyz'
const RETIRED_WORDS_ORIGIN = /^https?:\/\/words\.knophy\.com/i
const SECTION_LINK =
  /^https?:\/\/words\.(?:pisspoursoftware\.xyz|knophy\.com)\/recording\/[0-9a-f-]{36}\/section\/[^\s?]+(?:\?\S*)?$/i
const RECORDING_PREFIX =
  /^Recording 0*(\d+)(?: \([0-9a-f-]{36}\))? #(\d+)(?:-(\d+))?:?\s*/i
const LINE_NUMBER = /#(\d+)/g
const SHORT_ID_LENGTH = 8

/** The first and last line numbers a Mention names: `#2735` to `#2737`. */
export const LineRange = S.Struct({ first: S.Int, last: S.Int })
/** The first and last line numbers a Mention names: `#2735` to `#2737`. */
export type LineRange = typeof LineRange.Type

/** One Mention's lines in a Recording: their range, his words, when, and the words page they open. */
export const MentionedLine = S.Struct({
  atMs: S.Option(S.Number),
  deepLink: S.Option(S.String),
  lineRange: S.Option(LineRange),
  quote: S.String,
})
/** One Mention's lines in a Recording: their range, his words, when, and the words page they open. */
export type MentionedLine = typeof MentionedLine.Type

/** Every line of one Recording that mentioned an Issue, newest first. */
export const RecordingMentionGroup = S.Struct({
  lines: S.Array(MentionedLine),
  newestAtMs: S.Option(S.Number),
  recordingId: S.String,
  recordingLabel: S.String,
})
/** Every line of one Recording that mentioned an Issue, newest first. */
export type RecordingMentionGroup = typeof RecordingMentionGroup.Type

type RecordingSaid = Readonly<{ recordingId: string; mention: IssueMention }>

const recordingSaidOf = (
  mention: IssueMention,
): Option.Option<RecordingSaid> =>
  mention.source._tag === 'Recording'
    ? Option.some({
        recordingId: mention.source.recording.recordingId.toLowerCase(),
        mention,
      })
    : Option.none()

const prefixOf = (quote: string): Option.Option<RegExpExecArray> =>
  Option.fromNullishOr(RECORDING_PREFIX.exec(quote))

const rangeOfPrefix = (prefix: RegExpExecArray): LineRange => {
  const first = Number(prefix[2])
  return { first, last: prefix[3] === undefined ? first : Number(prefix[3]) }
}

const rangeOfNote = (note: string): Option.Option<LineRange> =>
  note.startsWith('Lines:')
    ? pipe(
        Array.fromIterable(note.matchAll(LINE_NUMBER)),
        Array.map(match => Number(match[1])),
        Array.match({
          onEmpty: () => Option.none(),
          onNonEmpty: numbers =>
            Option.some({
              first: Math.min(...numbers),
              last: Math.max(...numbers),
            }),
        }),
      )
    : Option.none()

const deepLinkOf = (mention: IssueMention): Option.Option<string> =>
  Array.findFirst(mention.related, reference =>
    reference._tag === 'Uri' && SECTION_LINK.test(reference.value)
      ? Option.some(reference.value.replace(RETIRED_WORDS_ORIGIN, WORDS_ORIGIN))
      : Option.none(),
  )

const lineOf = (mention: IssueMention): MentionedLine => {
  const words = Option.getOrElse(
    Option.orElse(mention.directQuote, () => mention.note),
    () => '',
  )
  const maybePrefix = prefixOf(words)
  return {
    atMs: mention.capturedAtMs,
    deepLink: deepLinkOf(mention),
    lineRange: Option.orElse(Option.map(maybePrefix, rangeOfPrefix), () =>
      Option.flatMap(mention.note, rangeOfNote),
    ),
    quote: Option.match(maybePrefix, {
      onNone: () => words,
      onSome: prefix => words.slice(prefix[0].length),
    }),
  }
}

const recordingLabelOf = (
  recordingId: string,
  saids: ReadonlyArray<RecordingSaid>,
): string =>
  pipe(
    Array.findFirst(saids, ({ mention }) =>
      Option.flatMap(mention.directQuote, prefixOf),
    ),
    Option.match({
      onNone: () => `Recording ${recordingId.slice(0, SHORT_ID_LENGTH)}`,
      onSome: prefix => `Recording ${Number(prefix[1]).toString()}`,
    }),
  )

const atMsOrOldest = (atMs: Option.Option<number>): number =>
  Option.getOrElse(atMs, () => Number.NEGATIVE_INFINITY)

const newestLineFirst: Order.Order<MentionedLine> = Order.flip(
  Order.mapInput(Order.Number, (line: MentionedLine) =>
    atMsOrOldest(line.atMs),
  ),
)

const newestGroupFirst: Order.Order<RecordingMentionGroup> = Order.flip(
  Order.mapInput(Order.Number, (group: RecordingMentionGroup) =>
    atMsOrOldest(group.newestAtMs),
  ),
)

const groupOf = (
  recordingId: string,
  saids: ReadonlyArray<RecordingSaid>,
): RecordingMentionGroup => {
  const lines = Array.sort(
    Array.map(saids, ({ mention }) => lineOf(mention)),
    newestLineFirst,
  )
  return {
    lines,
    newestAtMs: Option.flatMap(Array.head(lines), line => line.atMs),
    recordingId,
    recordingLabel: recordingLabelOf(recordingId, saids),
  }
}

/** The Recordings and lines that mentioned an Issue, the Recording with the newest line first. */
export const mentionedIn = (
  issue: Issue,
): ReadonlyArray<RecordingMentionGroup> =>
  pipe(
    Array.flatMap(issue.mentions, mention =>
      Option.toArray(recordingSaidOf(mention)),
    ),
    Array.groupBy(({ recordingId }) => recordingId),
    Record.toEntries,
    Array.map(([recordingId, saids]) => groupOf(recordingId, saids)),
    Array.sort(newestGroupFirst),
  )

/** `#2735-2737`, `#2273`, or `no line link`. */
export const lineRangeLabel = (line: MentionedLine): string =>
  Option.match(line.lineRange, {
    onNone: () => 'no line link',
    onSome: ({ first, last }) =>
      first === last
        ? `#${first.toString()}`
        : `#${first.toString()}-${last.toString()}`,
  })
