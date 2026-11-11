import { Array, Option, Order, Schema as S, pipe } from 'effect'

// Which recordings mention an Issue, and how many times (Scribe #2248). Scribe's
// `issueMentions` rows link the recording each mention came from
// (`issueMentions.recording`), so one query reads every recording that mentions
// an Issue, each with that Issue's mentions: a recording's count is their
// number, never a second counter kept beside them.

// MODEL

/** The lines a mention stands on: its first line's id and the #numbers of its first and last lines. */
export const MentionLine = S.Struct({
  first: S.Int,
  last: S.Int,
  segmentId: S.String,
})
/** The lines a mention stands on. */
export type MentionLine = typeof MentionLine.Type

/**
 * One mention of an Issue in a recording: when the tracker took it, the lines
 * its moment stands on when they resolved, and where in the recording it
 * starts, in seconds.
 */
export const IssueRecordingMention = S.Struct({
  id: S.String,
  maybeCapturedAtMs: S.Option(S.Number),
  maybeLine: S.Option(MentionLine),
  maybeStartSeconds: S.Option(S.Number),
})
/** One mention of an Issue in a recording. */
export type IssueRecordingMention = typeof IssueRecordingMention.Type

/**
 * A recording that mentions an Issue, such as `Recording 411 — Nov 11, 2026`,
 * with every mention of that Issue in it, oldest first. Two mentions in one
 * recording are two entries.
 */
export const IssueRecording = S.Struct({
  id: S.String,
  mentions: S.Array(IssueRecordingMention),
  startedAtMs: S.Number,
  title: S.String,
})
/** A recording that mentions an Issue, with every mention of it. */
export type IssueRecording = typeof IssueRecording.Type

// QUERY

/**
 * What to ask Scribe's app for the recordings that mention an Issue, by its
 * number: each recording whose mentions name the Issue, with those mentions and
 * the lines their moments stand on. #2248 asks `recordings` where
 * `issueMentions.issue.number` is 2248.
 */
export const issueRecordingsQuery = (issueNumber: number) => ({
  recordings: {
    $: {
      where: { 'issueMentions.issue.number': issueNumber },
      fields: ['id', 'title', 'startedAtMs'],
    },
    issueMentions: {
      $: {
        where: { 'issue.number': issueNumber },
        fields: ['id', 'capturedAtMs', 'sourceJSON'],
      },
      moment: {
        $: {
          fields: [
            'segmentID',
            'startSeconds',
            'firstLineIndex',
            'lastLineIndex',
          ],
        },
      },
    },
  },
})

// STORED

const OptionalText = S.optionalKey(S.NullOr(S.String))
const OptionalNumber = S.optionalKey(S.NullOr(S.Number))

const StoredMoment = S.Struct({
  firstLineIndex: OptionalNumber,
  lastLineIndex: OptionalNumber,
  segmentID: OptionalText,
  startSeconds: OptionalNumber,
})

const StoredMention = S.Struct({
  capturedAtMs: OptionalNumber,
  id: S.String,
  moment: S.optionalKey(
    S.NullOr(S.Union([StoredMoment, S.Array(StoredMoment)])),
  ),
  sourceJSON: OptionalText,
})

const StoredRecording = S.Struct({
  id: S.String,
  issueMentions: S.optionalKey(S.Array(StoredMention)),
  startedAtMs: S.Number,
  title: S.String,
})

const StoredRecordings = S.Struct({ recordings: S.Array(StoredRecording) })

const MILLISECONDS_PER_SECOND = 1000

const isList = <A>(value: A | ReadonlyArray<A>): value is ReadonlyArray<A> =>
  globalThis.Array.isArray(value)

const momentOf = (
  stored: typeof StoredMention.Type,
): Option.Option<typeof StoredMoment.Type> => {
  const moment = stored.moment
  if (moment === null || moment === undefined) {
    return Option.none()
  } else if (isList(moment)) {
    return Array.head(moment)
  } else {
    return Option.some(moment)
  }
}

/** Where the tracker's mention starts in its recording, from its source: `recording.startMilliseconds`. */
const sourceStartSeconds = (
  sourceJSON: string | null | undefined,
): Option.Option<number> => {
  if (sourceJSON === null || sourceJSON === undefined) {
    return Option.none()
  }
  try {
    const source: unknown = JSON.parse(sourceJSON)
    const startMilliseconds: unknown =
      typeof source === 'object' && source !== null && 'recording' in source
        ? (source.recording as { startMilliseconds?: unknown } | null)
            ?.startMilliseconds
        : undefined
    return typeof startMilliseconds === 'number'
      ? Option.some(startMilliseconds / MILLISECONDS_PER_SECOND)
      : Option.none()
  } catch {
    return Option.none()
  }
}

const mentionOf = (
  stored: typeof StoredMention.Type,
): IssueRecordingMention => {
  const maybeMoment = momentOf(stored)
  return IssueRecordingMention.make({
    id: stored.id,
    maybeCapturedAtMs: Option.fromNullishOr(stored.capturedAtMs),
    maybeLine: Option.flatMap(maybeMoment, moment =>
      typeof moment.segmentID === 'string' &&
      typeof moment.firstLineIndex === 'number'
        ? Option.some({
            first: moment.firstLineIndex,
            last: moment.lastLineIndex ?? moment.firstLineIndex,
            segmentId: moment.segmentID,
          })
        : Option.none(),
    ),
    maybeStartSeconds: Option.orElse(
      Option.flatMap(maybeMoment, moment =>
        Option.fromNullishOr(moment.startSeconds),
      ),
      () => sourceStartSeconds(stored.sourceJSON),
    ),
  })
}

const oldestMentionFirst: Order.Order<IssueRecordingMention> = Order.mapInput(
  Order.Number,
  (mention: IssueRecordingMention) =>
    Option.getOrElse(mention.maybeCapturedAtMs, () => 0),
)

const oldestRecordingFirst: Order.Order<IssueRecording> = Order.mapInput(
  Order.Number,
  (recording: IssueRecording) => recording.startedAtMs,
)

/**
 * The recordings that mention an Issue, from the rows Instant answers
 * `issueRecordingsQuery` with: oldest recording first, each with its mentions
 * of the Issue, oldest first. Instant answers a link to one row as that row or
 * as a list of one; both read the same.
 */
export const issueRecordingsOf = (
  data: unknown,
): ReadonlyArray<IssueRecording> =>
  pipe(
    S.decodeUnknownSync(StoredRecordings)(data).recordings,
    Array.map(stored =>
      IssueRecording.make({
        id: stored.id,
        mentions: Array.sort(
          Array.map(stored.issueMentions ?? [], mentionOf),
          oldestMentionFirst,
        ),
        startedAtMs: stored.startedAtMs,
        title: stored.title,
      }),
    ),
    Array.sort(oldestRecordingFirst),
  )

/** How many mentions the recordings hold together: each mention once, two in one recording twice. */
export const mentionsInRecordings = (
  recordings: ReadonlyArray<IssueRecording>,
): number =>
  Array.reduce(
    recordings,
    0,
    (total, recording) => total + recording.mentions.length,
  )
