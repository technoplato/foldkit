import { Array, Option, Order, Schema as S } from 'effect'

import {
  MOMENT_FIELDS,
  SaidMoment,
  StoredMoment,
  momentsOf,
} from './decisionFacts.js'
import {
  OptionalText,
  StoredRows,
  issueIdsOf,
  keptRowsOf,
  listOf,
  manyOf,
} from './storedRows.js'

// QUESTION

/**
 * One question as a chip, a list and an Issue draw it: the sentence, who asked,
 * its state and when. `open`, `answered` or `dismissed`, and `isLearning` when
 * he wants to learn about it.
 */
export const QuestionRow = S.Struct({
  askedAtMs: S.Number,
  askedBy: S.String,
  isLearning: S.Boolean,
  issueIds: S.Array(S.String),
  maybeAskerName: S.Option(S.String),
  maybeRecordingId: S.Option(S.String),
  questionId: S.String,
  status: S.String,
  text: S.String,
})
/** One question as a chip, a list and an Issue draw it. */
export type QuestionRow = typeof QuestionRow.Type

/** One answer: who gave it, as whom, when, its words and any source it cites. */
export const QuestionAnswer = S.Struct({
  answerId: S.String,
  answeredAtMs: S.Number,
  answeredBy: S.String,
  answererName: S.String,
  maybeThreadId: S.Option(S.String),
  maybeUrl: S.Option(S.String),
  text: S.String,
})
/** One answer to a question. */
export type QuestionAnswer = typeof QuestionAnswer.Type

/**
 * What Scribe's rows say about one question: the row, his words, every answer
 * in the order they came, and what the listener made of it.
 */
export const QuestionFacts = S.TaggedStruct('QuestionFacts', {
  answers: S.Array(QuestionAnswer),
  maybeNote: S.Option(S.String),
  moments: S.Array(SaidMoment),
  question: QuestionRow,
})
/** What Scribe's rows say about one question. */
export type QuestionFacts = typeof QuestionFacts.Type

// STORED

const StoredQuestion = S.Struct({
  askedAtMs: S.Number,
  askedBy: S.String,
  askerName: OptionalText,
  id: S.String,
  issueNumbersJSON: OptionalText,
  learning: S.Boolean,
  recordingID: OptionalText,
  status: S.String,
  text: S.String,
})

const StoredQuestions = S.Struct({ questions: StoredRows })

const StoredAnswer = S.Struct({
  answeredAtMs: S.Number,
  answeredBy: S.String,
  answererName: S.String,
  id: S.String,
  text: S.String,
  threadID: OptionalText,
  url: OptionalText,
})

const StoredQuestionPages = S.Struct({
  questions: S.Array(
    S.Struct({
      ...StoredQuestion.fields,
      answers: manyOf(StoredAnswer),
      moments: manyOf(StoredMoment),
      note: OptionalText,
    }),
  ),
})

const questionOf = (stored: typeof StoredQuestion.Type): QuestionRow =>
  QuestionRow.make({
    askedAtMs: stored.askedAtMs,
    askedBy: stored.askedBy,
    isLearning: stored.learning,
    issueIds: issueIdsOf(undefined, stored.issueNumbersJSON),
    maybeAskerName: Option.fromNullishOr(stored.askerName),
    maybeRecordingId: Option.fromNullishOr(stored.recordingID),
    questionId: stored.id,
    status: stored.status,
    text: stored.text,
  })

const answerOf = (stored: typeof StoredAnswer.Type): QuestionAnswer =>
  QuestionAnswer.make({
    answerId: stored.id,
    answeredAtMs: stored.answeredAtMs,
    answeredBy: stored.answeredBy,
    answererName: stored.answererName,
    maybeThreadId: Option.fromNullishOr(stored.threadID),
    maybeUrl: Option.fromNullishOr(stored.url),
    text: stored.text,
  })

/** The newest question first. */
export const newestQuestionFirst: Order.Order<QuestionRow> = Order.flip(
  Order.mapInput(Order.Number, (question: QuestionRow) => question.askedAtMs),
)

const oldestAnswerFirst: Order.Order<QuestionAnswer> = Order.mapInput(
  Order.Number,
  (answer: QuestionAnswer) => answer.answeredAtMs,
)

const decodedQuestion = (stored: unknown): QuestionRow =>
  questionOf(S.decodeUnknownSync(StoredQuestion)(stored))

/** The rows of a list of `questions`, the newest first. */
export const questionRowsOf = (
  stored: ReadonlyArray<unknown>,
): ReadonlyArray<QuestionRow> =>
  Array.sort(Array.map(stored, decodedQuestion), newestQuestionFirst)

/** Every question Instant answers with, the newest first. */
export const questionsOf = (data: unknown): ReadonlyArray<QuestionRow> =>
  questionRowsOf(S.decodeUnknownSync(StoredQuestions)(data).questions)

/**
 * A read of every question that keeps each row a live change left alone, the
 * newest first: one new question decodes one row, and each page's memo of the
 * other 964 holds.
 */
export const keptQuestionsOf = (): ((
  data: unknown,
) => ReadonlyArray<QuestionRow>) => {
  const kept = keptRowsOf(decodedQuestion)
  return data =>
    Array.sort(
      kept(S.decodeUnknownSync(StoredQuestions)(data).questions),
      newestQuestionFirst,
    )
}

/** A question's page from the row Instant answers with, none when it holds none. */
export const questionFactsOf = (data: unknown): Option.Option<QuestionFacts> =>
  Option.map(
    Array.head(S.decodeUnknownSync(StoredQuestionPages)(data).questions),
    stored =>
      QuestionFacts.make({
        answers: Array.sort(
          Array.map(listOf(stored.answers), answerOf),
          oldestAnswerFirst,
        ),
        maybeNote: Option.fromNullishOr(stored.note),
        moments: momentsOf(listOf(stored.moments)),
        question: questionOf(stored),
      }),
  )

// QUERY

/** What a question's chip, list row and Issue draw. */
export const QUESTION_FIELDS = [
  'askedAtMs',
  'askedBy',
  'askerName',
  'issueNumbersJSON',
  'learning',
  'recordingID',
  'status',
  'text',
]

/** What `/questions` asks for: every question's scalars, and no link per row. */
export const questionsQuery = {
  questions: { $: { fields: QUESTION_FIELDS } },
}

/** What a question's page asks for: the row by its id, his words, its answers. */
export const questionFactsQuery = (questionId: string) => ({
  questions: {
    $: {
      where: { id: questionId },
      fields: [...QUESTION_FIELDS, 'note'],
    },
    answers: {
      $: {
        fields: [
          'answeredAtMs',
          'answeredBy',
          'answererName',
          'text',
          'threadID',
          'url',
        ],
      },
    },
    moments: { $: { fields: MOMENT_FIELDS } },
  },
})
