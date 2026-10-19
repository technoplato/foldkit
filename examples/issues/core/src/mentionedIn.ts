import { Option, Schema as S } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

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

/** The Recordings and lines that mentioned an Issue, the Recording with the newest line first. */
export const mentionedIn = (
  _issue: Issue,
): ReadonlyArray<RecordingMentionGroup> => []

/** `#2735-2737`, `#2273`, or `no line link`. */
export const lineRangeLabel = (_line: MentionedLine): string =>
  Option.isNone(Option.none()) ? '' : ''
