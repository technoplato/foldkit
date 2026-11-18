import { Array, Option, Order, Schema as S, String, pipe } from 'effect'

import {
  OptionalNumber,
  OptionalText,
  StoredRows,
  issueIdsOf,
  keptRowsOf,
  listOf,
  manyOf,
} from './storedRows.js'

// MOMENT

/**
 * One stretch of his words behind a decision or a question, exactly as the
 * transcript or the chat has them. A said moment names its Recording, its lines
 * and its time: Recording 326 lines 87 to 100, 824 seconds in. A typed one has
 * none of those.
 */
export const SaidMoment = S.Struct({
  kind: S.String,
  maybeFirstLine: S.Option(S.Number),
  maybeLastLine: S.Option(S.Number),
  maybeRecordingId: S.Option(S.String),
  maybeSegmentId: S.Option(S.String),
  maybeStartSeconds: S.Option(S.Number),
  momentId: S.String,
  quote: S.String,
  role: S.String,
  startedAtMs: S.Number,
})
/** One stretch of his words. */
export type SaidMoment = typeof SaidMoment.Type

// DECISION

/**
 * One decision as a chip, a list and an Issue draw it: the sentence, its state
 * and when he said it. `decided`, `unconfirmed` (an agent's candidate, never
 * his until he confirms it), `rejected` or `superseded`.
 */
export const DecisionRow = S.Struct({
  decidedAtMs: S.Number,
  decisionId: S.String,
  issueIds: S.Array(S.String),
  maybeRecordingId: S.Option(S.String),
  maybeSupersededById: S.Option(S.String),
  status: S.String,
  text: S.String,
})
/** One decision as a chip, a list and an Issue draw it. */
export type DecisionRow = typeof DecisionRow.Type

/**
 * What agents ask that a decision answers, from the `faq:` line of its note:
 * `May a Grok agent do UI work?`, for `Every UI task, ever: Grok does none.`
 */
export const AgentAsk = S.Struct({
  maybeUntil: S.Option(S.String),
  question: S.String,
  scope: S.String,
})
/** What agents ask that a decision answers. */
export type AgentAsk = typeof AgentAsk.Type

/**
 * What Scribe's rows say about one decision: the row, his words, what it
 * replaces when that has no row of its own, why the recorder read it as his,
 * and who recorded it.
 */
export const DecisionFacts = S.TaggedStruct('DecisionFacts', {
  decision: DecisionRow,
  maybeAgentAsk: S.Option(AgentAsk),
  maybeNote: S.Option(S.String),
  maybeReplaces: S.Option(S.String),
  moments: S.Array(SaidMoment),
  recordedBy: S.String,
  source: S.String,
})
/** What Scribe's rows say about one decision. */
export type DecisionFacts = typeof DecisionFacts.Type

// STORED

/** One `sourceMoments` row, as a link answers with it. */
export const StoredMoment = S.Struct({
  firstLineIndex: OptionalNumber,
  id: S.String,
  kind: OptionalText,
  lastLineIndex: OptionalNumber,
  quote: S.String,
  recordingID: OptionalText,
  role: S.String,
  segmentID: OptionalText,
  startSeconds: OptionalNumber,
  startedAtMs: S.Number,
})

const StoredDecision = S.Struct({
  decidedAtMs: S.Number,
  id: S.String,
  issueNumbersJSON: OptionalText,
  recordingID: OptionalText,
  status: S.String,
  supersededByID: OptionalText,
  text: S.String,
})

const StoredDecisions = S.Struct({ decisions: StoredRows })

const StoredDecisionPages = S.Struct({
  decisions: S.Array(
    S.Struct({
      ...StoredDecision.fields,
      moments: manyOf(StoredMoment),
      note: OptionalText,
      recordedBy: S.String,
      replaces: OptionalText,
      source: S.String,
    }),
  ),
})

const StoredAgentAsk = S.Struct({
  question: S.String,
  scope: S.String,
  until: OptionalText,
})

const SAID = 'said'
const AGENT_ASK_PREFIX = 'faq: '

const momentOf = (stored: typeof StoredMoment.Type): SaidMoment =>
  SaidMoment.make({
    kind: stored.kind ?? SAID,
    maybeFirstLine: Option.fromNullishOr(stored.firstLineIndex),
    maybeLastLine: Option.fromNullishOr(stored.lastLineIndex),
    maybeRecordingId: Option.fromNullishOr(stored.recordingID),
    maybeSegmentId: Option.fromNullishOr(stored.segmentID),
    maybeStartSeconds: Option.fromNullishOr(stored.startSeconds),
    momentId: stored.id,
    quote: stored.quote,
    role: stored.role,
    startedAtMs: stored.startedAtMs,
  })

/** His words in the order he said them. */
export const oldestMomentFirst: Order.Order<SaidMoment> = Order.mapInput(
  Order.Number,
  (moment: SaidMoment) => moment.startedAtMs,
)

/** A row's moments as Instant answers with them, in the order he said them. */
export const momentsOf = (
  stored: ReadonlyArray<typeof StoredMoment.Type>,
): ReadonlyArray<SaidMoment> =>
  Array.sort(Array.map(stored, momentOf), oldestMomentFirst)

const decisionOf = (stored: typeof StoredDecision.Type): DecisionRow =>
  DecisionRow.make({
    decidedAtMs: stored.decidedAtMs,
    decisionId: stored.id,
    issueIds: issueIdsOf(undefined, stored.issueNumbersJSON),
    maybeRecordingId: Option.fromNullishOr(stored.recordingID),
    maybeSupersededById: Option.fromNullishOr(stored.supersededByID),
    status: stored.status,
    text: stored.text,
  })

/** The newest decision first. */
export const newestDecisionFirst: Order.Order<DecisionRow> = Order.flip(
  Order.mapInput(Order.Number, (decision: DecisionRow) => decision.decidedAtMs),
)

const isAgentAskLine = (line: string): boolean =>
  line.startsWith(AGENT_ASK_PREFIX)

const agentAskOf = (
  stored: string | null | undefined,
): Option.Option<AgentAsk> =>
  pipe(
    Option.fromNullishOr(stored),
    Option.flatMap(note => Array.findFirst(note.split('\n'), isAgentAskLine)),
    Option.flatMap(
      Option.liftThrowable((line: string): unknown =>
        JSON.parse(line.slice(AGENT_ASK_PREFIX.length)),
      ),
    ),
    Option.flatMap(S.decodeUnknownOption(StoredAgentAsk)),
    Option.map(({ question, scope, until }) =>
      AgentAsk.make({
        maybeUntil: Option.fromNullishOr(until),
        question,
        scope,
      }),
    ),
  )

const readingOf = (stored: string | null | undefined): Option.Option<string> =>
  pipe(
    Option.fromNullishOr(stored),
    Option.map(note =>
      Array.join(
        Array.filter(note.split('\n'), line => !isAgentAskLine(line)),
        '\n',
      ),
    ),
    Option.filter(String.isNonEmpty),
  )

const decodedDecision = (stored: unknown): DecisionRow =>
  decisionOf(S.decodeUnknownSync(StoredDecision)(stored))

/** Every decision Instant answers with, the newest first. */
export const decisionsOf = (data: unknown): ReadonlyArray<DecisionRow> =>
  Array.sort(
    Array.map(
      S.decodeUnknownSync(StoredDecisions)(data).decisions,
      decodedDecision,
    ),
    newestDecisionFirst,
  )

/**
 * A read of every decision that keeps each row a live change left alone, the
 * newest first, so one new decision decodes one row.
 */
export const keptDecisionsOf = (): ((
  data: unknown,
) => ReadonlyArray<DecisionRow>) => {
  const kept = keptRowsOf(decodedDecision)
  return data =>
    Array.sort(
      kept(S.decodeUnknownSync(StoredDecisions)(data).decisions),
      newestDecisionFirst,
    )
}

/** A decision's page from the row Instant answers with, none when it holds none. */
export const decisionFactsOf = (data: unknown): Option.Option<DecisionFacts> =>
  Option.map(
    Array.head(S.decodeUnknownSync(StoredDecisionPages)(data).decisions),
    stored =>
      DecisionFacts.make({
        decision: decisionOf(stored),
        maybeAgentAsk: agentAskOf(stored.note),
        maybeNote: readingOf(stored.note),
        maybeReplaces: Option.fromNullishOr(stored.replaces),
        moments: momentsOf(listOf(stored.moments)),
        recordedBy: stored.recordedBy,
        source: stored.source,
      }),
  )

// QUERY

const DECISION_FIELDS = [
  'decidedAtMs',
  'issueNumbersJSON',
  'recordingID',
  'status',
  'supersededByID',
  'text',
]

/** What a moment's chip and words draw. */
export const MOMENT_FIELDS = [
  'firstLineIndex',
  'kind',
  'lastLineIndex',
  'quote',
  'recordingID',
  'role',
  'segmentID',
  'startSeconds',
  'startedAtMs',
]

/**
 * Every decision's scalars, once per table: `issueNumbersJSON` is a JSON string
 * no query can ask about, so the 155 rows are read once, 45 KB, and an Issue,
 * a chip, the palette and `/decisions` all read them from one list.
 */
export const decisionsQuery = {
  decisions: { $: { fields: DECISION_FIELDS } },
}

/** What a decision's page asks for: the row by its id, and his words. */
export const decisionFactsQuery = (decisionId: string) => ({
  decisions: {
    $: {
      where: { id: decisionId },
      fields: [...DECISION_FIELDS, 'note', 'recordedBy', 'replaces', 'source'],
    },
    moments: { $: { fields: MOMENT_FIELDS } },
  },
})
