import { Array, Option, Order, Schema as S, pipe } from 'effect'

import { AgentClaudeLink, ClaudeLink, NoClaudeLink } from './issueAgents.js'
import { OptionalNumber, OptionalText } from './storedRows.js'

// Where an Issue is named (Scribe #2348): every line of a recording, post in a
// recording's thread, and Claude Code session that names it. Scribe writes one
// `issueReferences` row per place that names an Issue, by its number: one per
// line or post, and one per session or sub-agent of a session, holding when it
// first and last named the Issue. Nothing links the rows to the Issue, so one
// query by `issueNumber` reads them all, and `issues show`, its --json and the
// Issue page group them the same way: a sub-agent's row under its session's. A
// row matches by the Issue's number today; matching by meaning is not built.

// MODEL

const LINE_LINK_ORIGIN = 'https://og.pisspoursoftware.xyz'
const LINK_SECOND_DECIMALS = 2
const NO_CLAUDE_LINK = 'no claude.ai link was recorded'
const WORKED_ROLE = 'worked'

/** Where in a recording a place stands: one of its lines, or a post in a line's thread. */
export const RecordingPlaceKind = S.Literals(['Line', 'ThreadPost'])
/** Where in a recording a place stands. */
export type RecordingPlaceKind = typeof RecordingPlaceKind.Type

/**
 * One place in a recording that names an Issue: his line, or a typed comment or
 * an agent's answer in a line's thread, with its deep link, who said it, when,
 * and the words that name it, verbatim.
 */
export const RecordingPlace = S.Struct({
  atMs: S.Number,
  id: S.String,
  kind: RecordingPlaceKind,
  link: S.String,
  matchedBy: S.String,
  maybeAuthorKind: S.Option(S.String),
  maybeAuthorName: S.Option(S.String),
  maybeLineIndex: S.Option(S.Number),
  maybeResponseId: S.Option(S.String),
  maybeSegmentId: S.Option(S.String),
  maybeStartSeconds: S.Option(S.Number),
  maybeThreadId: S.Option(S.String),
  quote: S.String,
})
/** One place in a recording that names an Issue. */
export type RecordingPlace = typeof RecordingPlace.Type

/** A recording that names an Issue, with each place in it, newest first. */
export const ReferencingRecording = S.Struct({
  id: S.String,
  maybeTitle: S.Option(S.String),
  places: S.Array(RecordingPlace),
})
/** A recording that names an Issue. */
export type ReferencingRecording = typeof ReferencingRecording.Type

/**
 * One agent of a session that names an Issue: the session's own agent or one
 * of its sub-agents, whether it worked on the Issue (a work-log entry on it)
 * or only named it, when it first and last named it, and its first words that
 * name it.
 */
export const SessionAgent = S.Struct({
  firstAtMs: S.Number,
  firstQuote: S.String,
  isWorked: S.Boolean,
  lastAtMs: S.Number,
  maybeAccount: S.Option(S.String),
  maybeAgentId: S.Option(S.String),
  maybeAgentName: S.Option(S.String),
})
/** One agent of a session that names an Issue. */
export type SessionAgent = typeof SessionAgent.Type

/**
 * A Claude Code session that names an Issue: its claude.ai link or why it has
 * none, its own agent when it named the Issue itself, and the sub-agents that
 * named it inside the session.
 */
export const ReferencingSession = S.Struct({
  key: S.String,
  lastAtMs: S.Number,
  link: AgentClaudeLink,
  maybeAccount: S.Option(S.String),
  maybeHostSessionId: S.Option(S.String),
  maybeSessionId: S.Option(S.String),
  own: S.Option(SessionAgent),
  subagents: S.Array(SessionAgent),
})
/** A Claude Code session that names an Issue. */
export type ReferencingSession = typeof ReferencingSession.Type

/** Where an Issue is named: the recordings and the sessions, each newest first. */
export const IssueReferences = S.Struct({
  recordings: S.Array(ReferencingRecording),
  sessions: S.Array(ReferencingSession),
})
/** Where an Issue is named. */
export type IssueReferences = typeof IssueReferences.Type

/** A recording's title by its id, such as `Recording 428 — Nov 12, 2026`. */
export const RecordingTitle = S.Struct({ id: S.String, title: S.String })
/** A recording's title by its id. */
export type RecordingTitle = typeof RecordingTitle.Type

const secondsForLink = (seconds: number): string =>
  Number(seconds.toFixed(LINK_SECOND_DECIMALS)).toString()

/**
 * The deep link of a place in a recording:
 * `https://og.pisspoursoftware.xyz/recording/<id>/section/<line>?t=<s>`, leaving
 * out the line or the time when the row does not hold it.
 */
export const recordingPlaceLink = (
  recordingId: string,
  maybeSegmentId: Option.Option<string>,
  maybeStartSeconds: Option.Option<number>,
): string =>
  Array.join(
    [
      `${LINE_LINK_ORIGIN}/recording/${recordingId.toLowerCase()}`,
      ...Option.toArray(
        Option.map(maybeSegmentId, segmentId => `/section/${segmentId}`),
      ),
      ...Option.toArray(
        Option.map(
          maybeStartSeconds,
          seconds => `?t=${secondsForLink(seconds)}`,
        ),
      ),
    ],
    '',
  )

/** How many places in recordings name the Issue: each line and thread post once. */
export const referencedPlaceCount = (references: IssueReferences): number =>
  Array.reduce(
    references.recordings,
    0,
    (total, recording) => total + recording.places.length,
  )

// QUERY

const REFERENCE_FIELDS = [
  'issueNumber',
  'placeKind',
  'matchedBy',
  'role',
  'quote',
  'atMs',
  'lastAtMs',
  'recordingID',
  'segmentID',
  'startSeconds',
  'lineIndex',
  'threadID',
  'responseID',
  'authorKind',
  'authorName',
  'sessionID',
  'hostSessionID',
  'agentID',
  'agentName',
  'account',
  'claudeURL',
  'source',
]

/**
 * What to ask Scribe's app for every place that names an Issue, by its
 * number, newest first: #2348 asks `issueReferences` where `issueNumber` is
 * 2348, ordered by `atMs` (indexed) descending.
 */
export const issueReferencesQuery = (issueNumber: number) => ({
  issueReferences: {
    $: {
      where: { issueNumber },
      order: { atMs: 'desc' as const },
      fields: REFERENCE_FIELDS,
    },
  },
})

/** What to ask Scribe's app for the titles of the recordings that name an Issue, by their ids. */
export const referenceRecordingsQuery = (
  recordingIds: ReadonlyArray<string>,
) => ({
  recordings: {
    $: {
      where: { id: { $in: [...recordingIds] } },
      fields: ['id', 'title'],
    },
  },
})

// STORED

const StoredReference = S.Struct({
  account: OptionalText,
  agentID: OptionalText,
  agentName: OptionalText,
  atMs: S.Number,
  authorKind: OptionalText,
  authorName: OptionalText,
  claudeURL: OptionalText,
  hostSessionID: OptionalText,
  id: S.String,
  lastAtMs: OptionalNumber,
  lineIndex: OptionalNumber,
  matchedBy: OptionalText,
  placeKind: S.String,
  quote: OptionalText,
  recordingID: OptionalText,
  responseID: OptionalText,
  role: OptionalText,
  segmentID: OptionalText,
  sessionID: OptionalText,
  startSeconds: OptionalNumber,
  threadID: OptionalText,
})
type StoredReference = typeof StoredReference.Type

const StoredReferences = S.Struct({
  issueReferences: S.Array(StoredReference),
})

const StoredTitles = S.Struct({ recordings: S.Array(RecordingTitle) })

const nonEmpty = (value: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), text => text.trim() !== '')

/** The recordings' titles from the rows Instant answers `referenceRecordingsQuery` with. */
export const recordingTitlesOf = (
  data: unknown,
): ReadonlyArray<RecordingTitle> =>
  S.decodeUnknownSync(StoredTitles)(data).recordings

// DERIVED

const PLACE_KINDS: ReadonlyArray<readonly [string, RecordingPlaceKind]> = [
  ['line', 'Line'],
  ['threadPost', 'ThreadPost'],
]
const SESSION_KIND = 'session'

const placeKindOf = (
  stored: StoredReference,
): Option.Option<RecordingPlaceKind> =>
  Option.map(
    Array.findFirst(
      PLACE_KINDS,
      ([storedKind]) => storedKind === stored.placeKind,
    ),
    ([, kind]) => kind,
  )

const newestFirst = <A>(atMsOf: (item: A) => number): Order.Order<A> =>
  Order.flip(Order.mapInput(Order.Number, atMsOf))

const placeOf = (
  stored: StoredReference,
  kind: RecordingPlaceKind,
  recordingId: string,
): RecordingPlace => {
  const maybeSegmentId = nonEmpty(stored.segmentID)
  const maybeStartSeconds = Option.fromNullishOr(stored.startSeconds)
  return RecordingPlace.make({
    atMs: stored.atMs,
    id: stored.id,
    kind,
    link: recordingPlaceLink(recordingId, maybeSegmentId, maybeStartSeconds),
    matchedBy: Option.getOrElse(nonEmpty(stored.matchedBy), () => 'number'),
    maybeAuthorKind: nonEmpty(stored.authorKind),
    maybeAuthorName: nonEmpty(stored.authorName),
    maybeLineIndex: Option.fromNullishOr(stored.lineIndex),
    maybeResponseId: nonEmpty(stored.responseID),
    maybeSegmentId,
    maybeStartSeconds,
    maybeThreadId: nonEmpty(stored.threadID),
    quote: stored.quote ?? '',
  })
}

const recordingsOf = (
  rows: ReadonlyArray<StoredReference>,
  titles: ReadonlyArray<RecordingTitle>,
): ReadonlyArray<ReferencingRecording> => {
  const places = Array.flatMap(rows, stored =>
    Option.toArray(
      Option.map(placeKindOf(stored), kind => {
        const recordingId = Option.getOrElse(
          Option.map(nonEmpty(stored.recordingID), id => id.toLowerCase()),
          () => '',
        )
        return { place: placeOf(stored, kind, recordingId), recordingId }
      }),
    ),
  )
  const recordingIds = Array.dedupe(
    Array.map(
      Array.sort(
        places,
        newestFirst((each: (typeof places)[number]) => each.place.atMs),
      ),
      each => each.recordingId,
    ),
  )
  return Array.map(recordingIds, recordingId =>
    ReferencingRecording.make({
      id: recordingId,
      maybeTitle: Option.map(
        Array.findFirst(
          titles,
          title => title.id.toLowerCase() === recordingId,
        ),
        title => title.title,
      ),
      places: pipe(
        places,
        Array.filter(each => each.recordingId === recordingId),
        Array.map(each => each.place),
        Array.sort(newestFirst((place: RecordingPlace) => place.atMs)),
      ),
    }),
  )
}

const firstSome = <A>(
  rows: ReadonlyArray<StoredReference>,
  valueOf: (stored: StoredReference) => Option.Option<A>,
): Option.Option<A> => Array.findFirst(rows, valueOf)

const oldestFirst = Order.mapInput(
  Order.Number,
  (stored: StoredReference) => stored.atMs,
)

const lastAtMsOf = (stored: StoredReference): number =>
  Math.max(stored.atMs, stored.lastAtMs ?? stored.atMs)

const agentOf = (
  rows: Array.NonEmptyReadonlyArray<StoredReference>,
): SessionAgent => {
  const ordered = Array.sort(rows, oldestFirst)
  const first = Array.headNonEmpty(ordered)
  return SessionAgent.make({
    firstAtMs: first.atMs,
    firstQuote: first.quote ?? '',
    isWorked: Array.some(rows, stored => stored.role === WORKED_ROLE),
    lastAtMs: Array.reduce(rows, first.atMs, (latest, stored) =>
      Math.max(latest, lastAtMsOf(stored)),
    ),
    maybeAccount: firstSome(ordered, stored => nonEmpty(stored.account)),
    maybeAgentId: firstSome(ordered, stored => nonEmpty(stored.agentID)),
    maybeAgentName: firstSome(ordered, stored => nonEmpty(stored.agentName)),
  })
}

/**
 * The key that holds a session's rows together: its claude.ai link, which a
 * work-log row carries in its prefix and a message row beside its Claude Code
 * session id; else that session id; else the Scribe session, the agent or the
 * row itself.
 */
const sessionKeyOf =
  (urlOfHost: ReadonlyMap<string, string>) =>
  (stored: StoredReference): string =>
    Option.getOrElse(
      Option.firstSomeOf([
        nonEmpty(stored.claudeURL),
        Option.flatMap(nonEmpty(stored.hostSessionID), host =>
          Option.fromUndefinedOr(urlOfHost.get(host)),
        ),
        nonEmpty(stored.hostSessionID),
        nonEmpty(stored.sessionID),
        nonEmpty(stored.agentID),
      ]),
      () => stored.id,
    )

const groupedBy = <A>(
  items: ReadonlyArray<A>,
  keyOf: (item: A) => string,
): ReadonlyArray<readonly [string, Array.NonEmptyReadonlyArray<A>]> =>
  Object.entries(Array.groupBy(items, keyOf))

const sessionOf = (
  key: string,
  rows: Array.NonEmptyReadonlyArray<StoredReference>,
): ReferencingSession => {
  const ownRows = Array.filter(rows, stored =>
    Option.isNone(nonEmpty(stored.agentName)),
  )
  const subagentRows = Array.filter(rows, stored =>
    Option.isSome(nonEmpty(stored.agentName)),
  )
  return ReferencingSession.make({
    key,
    lastAtMs: Array.reduce(rows, 0, (latest, stored) =>
      Math.max(latest, lastAtMsOf(stored)),
    ),
    link: Option.match(
      firstSome(rows, stored => nonEmpty(stored.claudeURL)),
      {
        onNone: () => NoClaudeLink.make({ why: NO_CLAUDE_LINK }),
        onSome: url => ClaudeLink.make({ url }),
      },
    ),
    maybeAccount: firstSome(rows, stored => nonEmpty(stored.account)),
    maybeHostSessionId: firstSome(rows, stored =>
      nonEmpty(stored.hostSessionID),
    ),
    maybeSessionId: firstSome(rows, stored => nonEmpty(stored.sessionID)),
    own: Array.match(ownRows, {
      onEmpty: () => Option.none(),
      onNonEmpty: rowsOfOwn => Option.some(agentOf(rowsOfOwn)),
    }),
    subagents: pipe(
      groupedBy(subagentRows, stored => stored.agentName ?? ''),
      Array.map(([, group]) => agentOf(group)),
      Array.sort(newestFirst((agent: SessionAgent) => agent.lastAtMs)),
    ),
  })
}

const sessionsOf = (
  rows: ReadonlyArray<StoredReference>,
): ReadonlyArray<ReferencingSession> => {
  const sessionRows = Array.filter(
    rows,
    stored => stored.placeKind === SESSION_KIND,
  )
  const urlOfHost = new Map(
    Array.flatMap(sessionRows, stored =>
      Option.toArray(
        Option.zipWith(
          nonEmpty(stored.hostSessionID),
          nonEmpty(stored.claudeURL),
          (host, url): readonly [string, string] => [host, url],
        ),
      ),
    ),
  )
  return pipe(
    groupedBy(sessionRows, sessionKeyOf(urlOfHost)),
    Array.map(([key, group]) => sessionOf(key, group)),
    Array.sort(newestFirst((session: ReferencingSession) => session.lastAtMs)),
  )
}

/**
 * Where an Issue is named, from the rows Instant answers
 * `issueReferencesQuery` with and the recordings' titles: each recording with
 * its lines and thread posts, and each Claude Code session with its sub-agents
 * under it, every list newest first. A row of a kind it does not know is left
 * out; rows that do not read are refused.
 */
export const issueReferencesOf = (
  data: unknown,
  titles: ReadonlyArray<RecordingTitle> = [],
): IssueReferences => {
  const rows = S.decodeUnknownSync(StoredReferences)(data).issueReferences
  return IssueReferences.make({
    recordings: recordingsOf(rows, titles),
    sessions: sessionsOf(rows),
  })
}

/** The ids of the recordings that name an Issue, for `referenceRecordingsQuery`. */
export const referencedRecordingIds = (
  references: IssueReferences,
): ReadonlyArray<string> =>
  Array.filter(
    Array.map(references.recordings, recording => recording.id),
    id => id !== '',
  )
