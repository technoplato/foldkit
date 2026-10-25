import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'

import type {
  Answer,
  Answerer,
  Asker,
  Question,
  QuestionStatus,
  Stretch,
  StretchRole,
} from './model.js'

const OptionalString = S.optionalKey(S.NullOr(S.String))
const OptionalNumber = S.optionalKey(S.NullOr(S.Number))

const MomentRow = S.Struct({
  id: S.String,
  role: S.String,
  recordingID: OptionalString,
  segmentID: OptionalString,
  firstLineIndex: OptionalNumber,
  lastLineIndex: OptionalNumber,
  startSeconds: OptionalNumber,
  startedAtMs: S.Number,
  quote: S.String,
})
type MomentRow = typeof MomentRow.Type

const TopicRow = S.Struct({ path: S.String, title: S.String })

const AnswerRow = S.Struct({
  id: S.String,
  answeredBy: S.Literals(['agent', 'michael', 'person', 'source']),
  answererName: S.String,
  text: S.String,
  threadID: OptionalString,
  url: OptionalString,
  answeredAtMs: S.Number,
  moments: S.optionalKey(S.Array(S.Unknown)),
})
type AnswerRow = typeof AnswerRow.Type

const QuestionRow = S.Struct({
  id: S.String,
  text: S.String,
  askedBy: S.Literals(['michael', 'agent']),
  askerName: OptionalString,
  learning: S.Boolean,
  status: S.Literals(['open', 'answered', 'dismissed']),
  recordingID: OptionalString,
  askedAtMs: S.Number,
  note: OptionalString,
  issueNumbersJSON: OptionalString,
  answers: S.optionalKey(S.Array(S.Unknown)),
  moments: S.optionalKey(S.Array(S.Unknown)),
  topics: S.optionalKey(S.Array(S.Unknown)),
})
type QuestionRow = typeof QuestionRow.Type

const IssueNumbers = S.fromJsonString(S.Array(S.Number))

const presentText = (value: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), text => text.trim() !== '')

const roleOf = (role: string): Option.Option<StretchRole> =>
  M.value(role).pipe(
    M.withReturnType<Option.Option<StretchRole>>(),
    M.when('asked', () => Option.some('Asked')),
    M.when('refined', () => Option.some('Refined')),
    M.when('answered', () => Option.some('Answered')),
    M.orElse(() => Option.none()),
  )

const stretchOf = (row: MomentRow): Option.Option<Stretch> =>
  Option.gen(function* () {
    const role = yield* roleOf(row.role)
    const recordingID = yield* Option.fromNullishOr(row.recordingID)
    const segmentID = yield* Option.fromNullishOr(row.segmentID)
    const firstLineIndex = yield* Option.fromNullishOr(row.firstLineIndex)
    return {
      recordingID,
      segmentID,
      firstLineIndex,
      lastLineIndex: Option.getOrElse(
        Option.fromNullishOr(row.lastLineIndex),
        () => firstLineIndex,
      ),
      startSeconds: Option.getOrElse(
        Option.fromNullishOr(row.startSeconds),
        () => 0,
      ),
      startedAtMs: row.startedAtMs,
      quote: row.quote,
      role,
    }
  })

const byFirstSpoken = Order.mapInput(
  Order.Number,
  (stretch: Stretch) => stretch.startedAtMs,
)

const stretchesOf = (rows: ReadonlyArray<unknown>): ReadonlyArray<Stretch> =>
  pipe(
    rows,
    Array.map(row => S.decodeUnknownOption(MomentRow)(row)),
    Array.getSomes,
    Array.map(stretchOf),
    Array.getSomes,
    Array.sort(byFirstSpoken),
  )

const answererOf = (answeredBy: AnswerRow['answeredBy']): Answerer =>
  M.value(answeredBy).pipe(
    M.withReturnType<Answerer>(),
    M.when('agent', () => 'Agent'),
    M.when('michael', () => 'Michael'),
    M.when('person', () => 'Person'),
    M.when('source', () => 'Source'),
    M.exhaustive,
  )

const answerOf = (row: AnswerRow): Answer => ({
  id: row.id,
  answeredBy: answererOf(row.answeredBy),
  answererName: row.answererName,
  text: row.text,
  maybeThreadID: presentText(row.threadID),
  maybeUrl: presentText(row.url),
  answeredAtMs: row.answeredAtMs,
  stretches: stretchesOf(row.moments ?? []),
})

const byFirstAnswered = Order.mapInput(
  Order.Number,
  (answer: Answer) => answer.answeredAtMs,
)

const askerOf = (askedBy: QuestionRow['askedBy']): Asker =>
  askedBy === 'agent' ? 'Agent' : 'Michael'

const statusOf = (status: QuestionRow['status']): QuestionStatus =>
  M.value(status).pipe(
    M.withReturnType<QuestionStatus>(),
    M.when('open', () => 'Open'),
    M.when('answered', () => 'Answered'),
    M.when('dismissed', () => 'Dismissed'),
    M.exhaustive,
  )

const questionOf = (row: QuestionRow): Question => ({
  id: row.id,
  text: row.text,
  askedBy: askerOf(row.askedBy),
  maybeAskerName: presentText(row.askerName),
  isLearning: row.learning,
  status: statusOf(row.status),
  maybeRecordingID: presentText(row.recordingID),
  askedAtMs: row.askedAtMs,
  maybeNote: presentText(row.note),
  issueNumbers: pipe(
    presentText(row.issueNumbersJSON),
    Option.flatMap(json => S.decodeUnknownOption(IssueNumbers)(json)),
    Option.getOrElse(() => []),
  ),
  stretches: stretchesOf(row.moments ?? []),
  answers: pipe(
    row.answers ?? [],
    Array.map(answer => S.decodeUnknownOption(AnswerRow)(answer)),
    Array.getSomes,
    Array.map(answerOf),
    Array.sort(byFirstAnswered),
  ),
  topics: pipe(
    row.topics ?? [],
    Array.map(topic => S.decodeUnknownOption(TopicRow)(topic)),
    Array.getSomes,
  ),
})

/**
 * Reads his question rows with their answers, stretches and topics. A row that cannot be read is counted, not
 * dropped in silence: the page says how many there are.
 */
export const decodeQuestions = (
  rows: ReadonlyArray<unknown>,
): Readonly<{
  questions: ReadonlyArray<Question>
  unreadableCount: number
}> => {
  const decoded = Array.map(rows, row =>
    S.decodeUnknownOption(QuestionRow)(row),
  )
  return {
    questions: pipe(decoded, Array.getSomes, Array.map(questionOf)),
    unreadableCount: Array.filter(decoded, Option.isNone).length,
  }
}
