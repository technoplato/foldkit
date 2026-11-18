import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Result,
  Schema as S,
} from 'effect'
import {
  IssueRecording,
  type IssueRecordingMention,
  issueRecordingsOf,
  issueRecordingsQuery,
  mentionsInRecordings,
} from 'issues-core-example'

import { describeIssueTrackerCause } from '@foldkit/instant-tools/issues'

import { type ScribeQuery, buildJobsTimeout } from './builds.js'
import { rangeLabel, recordingDeepLink } from './mentions.js'

// Which recordings mention an Issue, and how many times, as `issues show` prints them (Scribe #2248): read from Scribe's rows by the
// one query core's issueRecordingsQuery names, so the command, the site and an agent ask the schema the same question.

/** Scribe answered: the recordings that mention the Issue, oldest first, each with its mentions of it. */
export const FoundIssueRecordings = S.TaggedStruct('FoundIssueRecordings', {
  recordings: S.Array(IssueRecording),
})

/**
 * The recordings could not be read, and why, such as
 * `Scribe's Instant app did not answer within 5 seconds.`
 */
export const UnavailableIssueRecordings = S.TaggedStruct(
  'UnavailableIssueRecordings',
  { reason: S.String },
)

/** What `issues show` learned of the recordings that mention an Issue. */
export const IssueRecordingsRead = S.Union([
  FoundIssueRecordings,
  UnavailableIssueRecordings,
])
/** What `issues show` learned of the recordings that mention an Issue. */
export type IssueRecordingsRead = typeof IssueRecordingsRead.Type

/**
 * Reads the recordings that mention an Issue by its number, such as 2248. It
 * never fails: recordings that cannot be read are
 * `UnavailableIssueRecordings` with the reason.
 */
export type IssueRecordingsReader = (
  issueNumber: number,
) => Effect.Effect<IssueRecordingsRead>

const MAXIMUM_REASON_LENGTH = 400

const oneLine = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > MAXIMUM_REASON_LENGTH
    ? `${line.slice(0, MAXIMUM_REASON_LENGTH)}…`
    : line
}

/**
 * Reads the recordings that mention an Issue from Scribe's Instant app with
 * `send`, waiting at most `timeout` (5 seconds, the bound on every wait), then
 * abandoning the request. It never fails: a refused query, no answer, or rows
 * that do not read are `UnavailableIssueRecordings` with the reason.
 */
export const readIssueRecordings = (
  send: ScribeQuery,
  issueNumber: number,
  timeout: Duration.Duration = buildJobsTimeout,
): Effect.Effect<IssueRecordingsRead> =>
  Effect.tryPromise({
    try: signal => send(issueRecordingsQuery(issueNumber), signal),
    catch: describeIssueTrackerCause,
  }).pipe(
    Effect.timeoutOption(timeout),
    Effect.map(maybeAnswer =>
      Option.match(maybeAnswer, {
        onNone: () =>
          UnavailableIssueRecordings.make({
            reason: `Scribe's Instant app did not answer within ${Duration.toSeconds(timeout).toString()} seconds.`,
          }),
        onSome: answer =>
          Result.match(
            Result.try(() => issueRecordingsOf(answer)),
            {
              onFailure: () =>
                UnavailableIssueRecordings.make({
                  reason:
                    "Scribe's Instant app answered with rows this command cannot read.",
                }),
              onSuccess: recordings =>
                FoundIssueRecordings.make({ recordings }),
            },
          ),
      }),
    ),
    Effect.catch(cause =>
      Effect.succeed(
        UnavailableIssueRecordings.make({
          reason: `the recordings query to Scribe's Instant app failed: ${oneLine(cause)}`,
        }),
      ),
    ),
  )

const counted = (count: number, word: string): string =>
  `${count.toString()} ${word}${count === 1 ? '' : 's'}`

const mentionLink = (
  recording: IssueRecording,
  mention: IssueRecordingMention,
): string =>
  recordingDeepLink(
    recording.id,
    Option.getOrUndefined(
      Option.map(mention.maybeLine, line => line.segmentId),
    ),
    Option.getOrUndefined(mention.maybeStartSeconds),
  )

const mentionLine = (
  recording: IssueRecording,
  mention: IssueRecordingMention,
): string =>
  `    ${Option.match(mention.maybeLine, {
    onNone: () => '',
    onSome: line => `${rangeLabel(line.first, line.last)}  `,
  })}${mentionLink(recording, mention)}`

/**
 * The lines `issues show` prints for the recordings that mention an Issue: a
 * blank line, the heading with the totals, then each recording with how many
 * times it mentions the Issue and a deep link per mention. `trackerIssueRecordingMentions`
 * is how many of the Issue's own mentions name a recording: when the rows reach
 * fewer, a line says so, so a mirror that fell behind is seen, not trusted.
 * Nothing for an Issue no recording mentions; one line saying why when Scribe
 * cannot be read.
 */
export const issueRecordingsSection = (
  read: IssueRecordingsRead,
  trackerIssueRecordingMentions: number,
): ReadonlyArray<string> =>
  M.value(read).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      FoundIssueRecordings: ({ recordings }) => {
        const total = mentionsInRecordings(recordings)
        if (
          Array.isReadonlyArrayEmpty(recordings) &&
          trackerIssueRecordingMentions === 0
        ) {
          return []
        }
        return [
          '',
          `Recordings (${counted(total, 'mention')} in ${counted(recordings.length, 'recording')}, from Scribe's rows)`,
          ...Array.flatMap(recordings, recording => [
            `  ${recording.title}  ${counted(recording.mentions.length, 'mention')}`,
            ...Array.map(recording.mentions, mention =>
              mentionLine(recording, mention),
            ),
          ]),
          ...(trackerIssueRecordingMentions > total
            ? [
                `  The tracker lists ${counted(trackerIssueRecordingMentions, 'mention')} from recordings; ${total.toString()} reach a recording in Scribe's rows (the mirror is behind, or a recording is not a row there).`,
              ]
            : []),
        ]
      },
      UnavailableIssueRecordings: ({ reason }) => [
        '',
        `Recordings not shown: ${reason}`,
      ],
    }),
  )

/** One mention as `issues show --json` gives it, with its deep link. */
export type IssueRecordingMentionJson = Readonly<{
  capturedAtMs?: number
  firstLine?: number
  id: string
  lastLine?: number
  link: string
  segmentId?: string
  startSeconds?: number
}>

/** One recording as `issues show --json` gives it: its count is its mentions'. */
export type IssueRecordingJson = Readonly<{
  id: string
  mentionCount: number
  mentions: ReadonlyArray<IssueRecordingMentionJson>
  startedAtMs: number
  title: string
}>

const mentionJson = (
  recording: IssueRecording,
  mention: IssueRecordingMention,
): IssueRecordingMentionJson => ({
  id: mention.id,
  ...Option.match(mention.maybeCapturedAtMs, {
    onNone: () => ({}),
    onSome: capturedAtMs => ({ capturedAtMs }),
  }),
  ...Option.match(mention.maybeLine, {
    onNone: () => ({}),
    onSome: line => ({
      firstLine: line.first,
      lastLine: line.last,
      segmentId: line.segmentId,
    }),
  }),
  ...Option.match(mention.maybeStartSeconds, {
    onNone: () => ({}),
    onSome: startSeconds => ({ startSeconds }),
  }),
  link: mentionLink(recording, mention),
})

/**
 * The keys `issues show --json` adds to the Issue: `recordings`, each
 * recording with `mentionCount` and its mentions' links, or
 * `recordingsNotShown`, why they could not be read.
 */
export const issueRecordingsJson = (
  read: IssueRecordingsRead,
): Readonly<{
  recordings?: ReadonlyArray<IssueRecordingJson>
  recordingsNotShown?: string
}> =>
  M.value(read).pipe(
    M.tagsExhaustive({
      FoundIssueRecordings: ({ recordings }) => ({
        recordings: Array.map(recordings, recording => ({
          id: recording.id,
          mentionCount: recording.mentions.length,
          mentions: Array.map(recording.mentions, mention =>
            mentionJson(recording, mention),
          ),
          startedAtMs: recording.startedAtMs,
          title: recording.title,
        })),
      }),
      UnavailableIssueRecordings: ({ reason }) => ({
        recordingsNotShown: reason,
      }),
    }),
  )

/** A reader for hosts with no Scribe app: no recording, nothing said. */
export const noIssueRecordingsReader: IssueRecordingsReader = () =>
  Effect.succeed(FoundIssueRecordings.make({ recordings: [] }))
