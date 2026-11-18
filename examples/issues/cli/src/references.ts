import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Order,
  Result,
  Schema as S,
} from 'effect'
import {
  IssueReferences,
  type RecordingPlace,
  type ReferencingRecording,
  type ReferencingSession,
  type SessionAgent,
  issueReferencesOf,
  issueReferencesQuery,
  recordingTitlesOf,
  referenceRecordingsQuery,
  referencedPlaceCount,
  referencedRecordingIds,
} from 'issues-core-example'

import { describeIssueTrackerCause } from '@foldkit/instant-tools/issues'

import {
  type ScribeQuery,
  buildJobsTimeout,
  localClockText,
  oneLine,
} from './builds.js'

// Where an Issue is named, as `issues show` prints it (Scribe #2348): every
// recording line, thread post and Claude Code session that names it, read from
// Scribe's issueReferences rows by the one query core's issueReferencesQuery
// names, so the command, its --json and the Issue page group them the same way.

/** How many places in recordings `issues show` prints: the newest 20. */
export const shownPlacesLimit = 20

/** How many sessions `issues show` prints: the newest 20. */
export const shownSessionsLimit = 20

const RECORDING_ID_SHOWN = 8

/** Scribe answered: the recordings and the sessions that name the Issue. */
export const FoundIssueReferences = S.TaggedStruct('FoundIssueReferences', {
  references: IssueReferences,
})

/**
 * Where the Issue is named could not be read, and why, such as
 * `the places query to Scribe's Instant app failed: ...`.
 */
export const UnavailableIssueReferences = S.TaggedStruct(
  'UnavailableIssueReferences',
  { reason: S.String },
)

/** What `issues show` learned of where an Issue is named. */
export const IssueReferencesRead = S.Union([
  FoundIssueReferences,
  UnavailableIssueReferences,
])
/** What `issues show` learned of where an Issue is named. */
export type IssueReferencesRead = typeof IssueReferencesRead.Type

/**
 * Reads where an Issue is named by its number, such as 2348. It never fails:
 * places that cannot be read are `UnavailableIssueReferences` with the reason.
 */
export type IssueReferencesReader = (
  issueNumber: number,
) => Effect.Effect<IssueReferencesRead>

const sent = (
  send: ScribeQuery,
  query: unknown,
  timeout: Duration.Duration,
): Effect.Effect<Option.Option<unknown>, string> =>
  Effect.tryPromise({
    try: signal => send(query, signal),
    catch: describeIssueTrackerCause,
  }).pipe(Effect.timeoutOption(timeout))

const withTitles = (
  send: ScribeQuery,
  data: unknown,
  references: IssueReferences,
  timeout: Duration.Duration,
): Effect.Effect<IssueReferences> => {
  const recordingIds = referencedRecordingIds(references)
  if (Array.isReadonlyArrayEmpty(recordingIds)) {
    return Effect.succeed(references)
  }
  return sent(send, referenceRecordingsQuery(recordingIds), timeout).pipe(
    Effect.map(maybeTitles =>
      Option.getOrElse(
        Option.flatMap(maybeTitles, titles =>
          Result.getSuccess(
            Result.try(() =>
              issueReferencesOf(data, recordingTitlesOf(titles)),
            ),
          ),
        ),
        () => references,
      ),
    ),
    Effect.catch(() => Effect.succeed(references)),
  )
}

/**
 * Reads where an Issue is named from Scribe's Instant app with `send`: the
 * places by the Issue's number, newest first, then the titles of their
 * recordings, each waiting at most `timeout` (5 seconds). It never fails: a
 * refused query (such as one asking for `issueReferences` before Scribe's
 * schema has it), no answer, or rows that do not read are
 * `UnavailableIssueReferences` with the reason; titles that cannot be read
 * leave the places without them.
 */
export const readIssueReferences = (
  send: ScribeQuery,
  issueNumber: number,
  timeout: Duration.Duration = buildJobsTimeout,
): Effect.Effect<IssueReferencesRead> =>
  sent(send, issueReferencesQuery(issueNumber), timeout).pipe(
    Effect.flatMap(
      (maybeAnswer): Effect.Effect<IssueReferencesRead, string> =>
        Option.match(maybeAnswer, {
          onNone: () =>
            Effect.succeed<IssueReferencesRead>(
              UnavailableIssueReferences.make({
                reason: `Scribe's Instant app did not answer within ${Duration.toSeconds(timeout).toString()} seconds.`,
              }),
            ),
          onSome: answer =>
            Result.match(
              Result.try(() => issueReferencesOf(answer)),
              {
                onFailure: () =>
                  Effect.succeed<IssueReferencesRead>(
                    UnavailableIssueReferences.make({
                      reason:
                        "Scribe's Instant app answered with rows this command cannot read.",
                    }),
                  ),
                onSuccess: references =>
                  Effect.map(
                    withTitles(send, answer, references, timeout),
                    (titled): IssueReferencesRead =>
                      FoundIssueReferences.make({ references: titled }),
                  ),
              },
            ),
        }),
    ),
    Effect.catch(cause =>
      Effect.succeed(
        UnavailableIssueReferences.make({
          reason: `the places query to Scribe's Instant app failed: ${oneLine(cause)}`,
        }),
      ),
    ),
  )

// TEXT

const counted = (count: number, word: string): string =>
  `${count.toString()} ${word}${count === 1 ? '' : 's'}`

const recordingTitle = (recording: ReferencingRecording): string =>
  Option.getOrElse(
    recording.maybeTitle,
    () =>
      `Recording ${Option.getOrElse(
        Option.liftPredicate(
          recording.id.slice(0, RECORDING_ID_SHOWN),
          id => id !== '',
        ),
        () => 'not named in its row',
      )}`,
  )

const placeWord = (place: RecordingPlace): string =>
  M.value(place.kind).pipe(
    M.withReturnType<string>(),
    M.when('Line', () =>
      Option.match(place.maybeLineIndex, {
        onNone: () => 'line',
        onSome: index => `line #${index.toString()}`,
      }),
    ),
    M.when('ThreadPost', () => 'thread post'),
    M.exhaustive,
  )

const placeLines = (
  place: RecordingPlace,
  timeZone: string,
): ReadonlyArray<string> => [
  `    ${Array.join(
    [
      placeWord(place),
      localClockText(place.atMs, timeZone),
      ...Option.toArray(place.maybeAuthorName),
      place.link,
    ],
    '  ',
  )}`,
  `      "${place.quote}"`,
]

type ShownPlace = Readonly<{
  place: RecordingPlace
  recording: ReferencingRecording
}>

const newestPlaces = (
  recordings: ReadonlyArray<ReferencingRecording>,
): ReadonlyArray<ShownPlace> =>
  Array.take(
    Array.sort(
      Array.flatMap(recordings, recording =>
        Array.map(recording.places, place => ({ place, recording })),
      ),
      Order.flip(
        Order.mapInput(Order.Number, (each: ShownPlace) => each.place.atMs),
      ),
    ),
    shownPlacesLimit,
  )

const recordingSection = (
  references: IssueReferences,
  issueId: string,
  timeZone: string,
): ReadonlyArray<string> => {
  const total = referencedPlaceCount(references)
  if (total === 0) {
    return []
  }
  const shown = newestPlaces(references.recordings)
  const hidden = total - shown.length
  return [
    '',
    `Named in recordings (${counted(total, 'place')} in ${counted(references.recordings.length, 'recording')}, newest first, from Scribe's rows)`,
    ...Array.flatMap(references.recordings, recording => {
      const places = Array.filter(
        shown,
        each => each.recording.id === recording.id,
      )
      return Array.isReadonlyArrayEmpty(places)
        ? []
        : [
            `  ${recordingTitle(recording)}`,
            ...Array.flatMap(places, each => placeLines(each.place, timeZone)),
          ]
    }),
    ...(hidden > 0
      ? [
          `  ${hidden.toString()} more: issues show ${String(Number(issueId))} --json`,
        ]
      : []),
  ]
}

const timesText = (agent: SessionAgent, timeZone: string): string => {
  const first = localClockText(agent.firstAtMs, timeZone)
  const last = localClockText(agent.lastAtMs, timeZone)
  return first === last ? first : `${first} to ${last}`
}

const agentText = (agent: SessionAgent, timeZone: string): string =>
  Array.join(
    [
      ...Option.toArray(
        Option.map(agent.maybeAccount, account => `account ${account}`),
      ),
      agent.isWorked ? 'worked' : 'named',
      timesText(agent, timeZone),
    ],
    '  ·  ',
  )

const sessionLabel = (session: ReferencingSession): string =>
  Option.getOrElse(
    Option.flatMap(session.own, own =>
      Option.orElse(own.maybeAgentId, () => own.maybeAgentName),
    ),
    () =>
      `session ${Option.getOrElse(session.maybeHostSessionId, () => session.key)}`,
  )

const linkText = (session: ReferencingSession): string =>
  M.value(session.link).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ClaudeLink: ({ url }) => url,
      NoClaudeLink: ({ why }) => why,
    }),
  )

const subagentName = (agent: SessionAgent): string =>
  Option.getOrElse(
    Option.orElse(agent.maybeAgentName, () => agent.maybeAgentId),
    () => 'unnamed',
  )

const sessionLines = (
  session: ReferencingSession,
  timeZone: string,
): ReadonlyArray<string> => [
  Option.match(session.own, {
    onNone: () => `  ${sessionLabel(session)}`,
    onSome: own => `  ${sessionLabel(session)}  ·  ${agentText(own, timeZone)}`,
  }),
  `    ${linkText(session)}`,
  ...Option.toArray(Option.map(session.own, own => `    "${own.firstQuote}"`)),
  ...Array.flatMap(session.subagents, subagent => [
    `    sub-agent ${subagentName(subagent)}  ·  ${agentText(subagent, timeZone)}`,
    `      "${subagent.firstQuote}"`,
  ]),
]

const sessionSection = (
  references: IssueReferences,
  issueId: string,
  timeZone: string,
): ReadonlyArray<string> => {
  const sessions = references.sessions
  if (Array.isReadonlyArrayEmpty(sessions)) {
    return []
  }
  const hidden = sessions.length - shownSessionsLimit
  return [
    '',
    `Sessions (${sessions.length.toString()} that name #${issueId}, newest first, from Scribe's rows)`,
    ...Array.flatMap(Array.take(sessions, shownSessionsLimit), session =>
      sessionLines(session, timeZone),
    ),
    ...(hidden > 0
      ? [
          `  ${hidden.toString()} more: issues show ${String(Number(issueId))} --json`,
        ]
      : []),
  ]
}

/**
 * The lines `issues show` prints for where an Issue is named: the recordings,
 * the newest 20 places with their deep links, who, when and the words, then
 * the Claude Code sessions with their claude.ai links or why they have none and
 * their sub-agents under them. Nothing for an Issue nothing names; one line
 * saying why when Scribe cannot be read.
 */
export const issueReferencesSection = (
  read: IssueReferencesRead,
  issueId: string,
  timeZone: string,
): ReadonlyArray<string> =>
  M.value(read).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      FoundIssueReferences: ({ references }) => [
        ...recordingSection(references, issueId, timeZone),
        ...sessionSection(references, issueId, timeZone),
      ],
      UnavailableIssueReferences: ({ reason }) => [
        '',
        `Named in recordings and sessions not shown: ${reason}`,
      ],
    }),
  )

// JSON

const placeJson = (place: RecordingPlace) => ({
  id: place.id,
  kind: place.kind === 'Line' ? 'line' : 'threadPost',
  atMs: place.atMs,
  quote: place.quote,
  link: place.link,
  matchedBy: place.matchedBy,
  ...Option.match(place.maybeAuthorKind, {
    onNone: () => ({}),
    onSome: authorKind => ({ authorKind }),
  }),
  ...Option.match(place.maybeAuthorName, {
    onNone: () => ({}),
    onSome: authorName => ({ authorName }),
  }),
  ...Option.match(place.maybeLineIndex, {
    onNone: () => ({}),
    onSome: lineIndex => ({ lineIndex }),
  }),
  ...Option.match(place.maybeSegmentId, {
    onNone: () => ({}),
    onSome: segmentId => ({ segmentId }),
  }),
  ...Option.match(place.maybeStartSeconds, {
    onNone: () => ({}),
    onSome: startSeconds => ({ startSeconds }),
  }),
  ...Option.match(place.maybeThreadId, {
    onNone: () => ({}),
    onSome: threadId => ({ threadId }),
  }),
  ...Option.match(place.maybeResponseId, {
    onNone: () => ({}),
    onSome: responseId => ({ responseId }),
  }),
})

const agentJson = (agent: SessionAgent) => ({
  ...Option.match(agent.maybeAgentId, {
    onNone: () => ({}),
    onSome: agentId => ({ agentId }),
  }),
  ...Option.match(agent.maybeAgentName, {
    onNone: () => ({}),
    onSome: agentName => ({ agentName }),
  }),
  ...Option.match(agent.maybeAccount, {
    onNone: () => ({}),
    onSome: account => ({ account }),
  }),
  role: agent.isWorked ? 'worked' : 'named',
  firstAtMs: agent.firstAtMs,
  lastAtMs: agent.lastAtMs,
  firstQuote: agent.firstQuote,
})

const sessionJson = (session: ReferencingSession) => ({
  key: session.key,
  ...M.value(session.link).pipe(
    M.tagsExhaustive({
      ClaudeLink: ({ url }) => ({ claudeURL: url }),
      NoClaudeLink: ({ why }) => ({ claudeLinkMissing: why }),
    }),
  ),
  ...Option.match(session.maybeHostSessionId, {
    onNone: () => ({}),
    onSome: hostSessionId => ({ hostSessionId }),
  }),
  ...Option.match(session.maybeSessionId, {
    onNone: () => ({}),
    onSome: sessionId => ({ sessionId }),
  }),
  ...Option.match(session.maybeAccount, {
    onNone: () => ({}),
    onSome: account => ({ account }),
  }),
  ...Option.match(session.own, {
    onNone: () => ({}),
    onSome: own => ({ own: agentJson(own) }),
  }),
  lastAtMs: session.lastAtMs,
  subagents: Array.map(session.subagents, agentJson),
})

/**
 * The keys `issues show --json` adds for where an Issue is named:
 * `references` with every recording (each with `placeCount` and its places)
 * and every session, none left out, or `referencesNotShown`, why they could
 * not be read.
 */
export const issueReferencesJson = (
  read: IssueReferencesRead,
): Readonly<{ references?: unknown; referencesNotShown?: string }> =>
  M.value(read).pipe(
    M.tagsExhaustive({
      FoundIssueReferences: ({ references }) => ({
        references: {
          recordings: Array.map(references.recordings, recording => ({
            id: recording.id,
            ...Option.match(recording.maybeTitle, {
              onNone: () => ({}),
              onSome: title => ({ title }),
            }),
            placeCount: recording.places.length,
            places: Array.map(recording.places, placeJson),
          })),
          sessions: Array.map(references.sessions, sessionJson),
        },
      }),
      UnavailableIssueReferences: ({ reason }) => ({
        referencesNotShown: reason,
      }),
    }),
  )

/** A reader for hosts with no Scribe app: nothing names the Issue, nothing said. */
export const noIssueReferencesReader: IssueReferencesReader = () =>
  Effect.succeed(
    FoundIssueReferences.make({
      references: IssueReferences.make({ recordings: [], sessions: [] }),
    }),
  )
