import {
  Array,
  Match as M,
  Option,
  Order,
  Schema as S,
  String,
  pipe,
} from 'effect'
import { ts } from 'foldkit/schema'

// MODEL

/** Who asked a question (Scribe ADR 0095): Michael, or an agent that asked him (an interview, Scribe #1048). */
export const Asker = S.Literals(['Michael', 'Agent'])
/** Who asked a question. */
export type Asker = typeof Asker.Type

/** Who answered a question: an agent, Michael himself, another person, or a source such as a page or a book. */
export const Answerer = S.Literals(['Agent', 'Michael', 'Person', 'Source'])
/** Who answered a question. */
export type Answerer = typeof Answerer.Type

/** Open until an answer is kept; dismissed when it was not a question to keep. */
export const QuestionStatus = S.Literals(['Open', 'Answered', 'Dismissed'])
/** Where a question stands. */
export type QuestionStatus = typeof QuestionStatus.Type

/** What a stretch of lines is to its question: where he asked it, came back to it, or where it was answered. */
export const StretchRole = S.Literals(['Asked', 'Refined', 'Answered'])
/** What a stretch of lines is to its question. */
export type StretchRole = typeof StretchRole.Type

/**
 * One stretch of a recording's lines, his words exactly, as a question or an answer keeps it: Recording 297's
 * #56-59, "Wonder if there's any way to detect proximity." "to airpods." ... "What is there?".
 */
export const Stretch = S.Struct({
  recordingID: S.String,
  segmentID: S.String,
  firstLineIndex: S.Number,
  lastLineIndex: S.Number,
  startSeconds: S.Number,
  startedAtMs: S.Number,
  quote: S.String,
  role: StretchRole,
})
/** One stretch of a recording's lines. */
export type Stretch = typeof Stretch.Type

/** One answer to a question: who gave it, its words, and where it was given (a thread, or its own lines). */
export const Answer = S.Struct({
  id: S.String,
  answeredBy: Answerer,
  answererName: S.String,
  text: S.String,
  maybeThreadID: S.Option(S.String),
  maybeUrl: S.Option(S.String),
  answeredAtMs: S.Number,
  stretches: S.Array(Stretch),
})
/** One answer to a question. */
export type Answer = typeof Answer.Type

/** A topic of his tree a question belongs to: `scribe/recording/live`, Live capture. */
export const QuestionTopic = S.Struct({ path: S.String, title: S.String })
/** A topic of his tree a question belongs to. */
export type QuestionTopic = typeof QuestionTopic.Type

/**
 * A question he asked, kept to learn from (Scribe ADR 0095): the question in one plain sentence, who asked, whether
 * he wants to learn about it, every stretch of his words (disjoint, and in other recordings), its answers, its topics,
 * and the tracker issues it led to.
 */
export const Question = S.Struct({
  id: S.String,
  text: S.String,
  askedBy: Asker,
  maybeAskerName: S.Option(S.String),
  isLearning: S.Boolean,
  status: QuestionStatus,
  maybeRecordingID: S.Option(S.String),
  askedAtMs: S.Number,
  maybeNote: S.Option(S.String),
  issueNumbers: S.Array(S.Number),
  stretches: S.Array(Stretch),
  answers: S.Array(Answer),
  topics: S.Array(QuestionTopic),
})
/** A question he asked, kept to learn from. */
export type Question = typeof Question.Type

/** Waiting for his questions. */
export const LoadingQuestions = ts('LoadingQuestions')
/** His questions, newest first, how many rows could not be read, and whether the query's limit cut the list. */
export const LoadedQuestions = ts('LoadedQuestions', {
  questions: S.Array(Question),
  unreadableCount: S.Number,
  isLimitReached: S.Boolean,
})
/** His questions could not load. */
export const FailedQuestions = ts('FailedQuestions', { reason: S.String })
/** Where his questions stand. */
export const QuestionsState = S.Union([
  LoadingQuestions,
  LoadedQuestions,
  FailedQuestions,
])
/** Where his questions stand. */
export type QuestionsState = typeof QuestionsState.Type

/** Which questions the page lists: every kept one, the ones he wants to learn from, or the ones not answered yet. */
export const QuestionFilter = S.Literals(['All', 'Learning', 'Open'])
/** Which questions the page lists. */
export type QuestionFilter = typeof QuestionFilter.Type

/** The questions Submodel: his questions, the words searched for, and which ones are listed. */
export const Model = S.Struct({
  state: QuestionsState,
  search: S.String,
  filter: QuestionFilter,
})
/** The questions Submodel. */
export type Model = typeof Model.Type

// INIT

/** Before his questions arrive: every one listed, nothing searched for. */
export const init = (): Model => ({
  state: LoadingQuestions(),
  search: '',
  filter: 'All',
})

// SELECTOR

/** Every word of a question a search looks in: the question, his words, the answers, the topics, the note. */
export const searchTextOf = (question: Question): string =>
  pipe(
    [
      question.text,
      Option.getOrElse(question.maybeNote, () => ''),
      ...Array.map(question.stretches, stretch => stretch.quote),
      ...Array.flatMap(question.answers, answer => [
        answer.text,
        answer.answererName,
      ]),
      ...Array.flatMap(question.topics, topic => [
        topic.title,
        String.replaceAll('/', ' ')(topic.path),
      ]),
    ],
    Array.join(' '),
    String.toLowerCase,
  )

/** Whether every word searched for is among the question's words. */
export const matchesSearch = (question: Question, search: string): boolean => {
  const haystack = searchTextOf(question)
  return pipe(
    String.toLowerCase(search),
    String.split(/\s+/),
    Array.filter(String.isNonEmpty),
    Array.every(word => String.includes(word)(haystack)),
  )
}

const isListed = (question: Question, filter: QuestionFilter): boolean =>
  M.value(filter).pipe(
    M.withReturnType<boolean>(),
    M.when('All', () => question.status !== 'Dismissed'),
    M.when(
      'Learning',
      () => question.isLearning && question.status !== 'Dismissed',
    ),
    M.when('Open', () => question.status === 'Open'),
    M.exhaustive,
  )

const byNewest = Order.mapInput(
  Order.flip(Order.Number),
  (question: Question) => question.askedAtMs,
)

/** The questions the page lists: the filter's, matching the search, newest first. */
export const listedQuestionsOf = (model: Model): ReadonlyArray<Question> =>
  M.value(model.state).pipe(
    M.withReturnType<ReadonlyArray<Question>>(),
    M.tag('LoadedQuestions', ({ questions }) =>
      pipe(
        questions,
        Array.filter(
          question =>
            isListed(question, model.filter) &&
            matchesSearch(question, model.search),
        ),
        Array.sort(byNewest),
      ),
    ),
    M.orElse(() => []),
  )

/** How many kept questions a filter covers, before the search narrows them. */
export const countFor = (model: Model, filter: QuestionFilter): number =>
  M.value(model.state).pipe(
    M.withReturnType<number>(),
    M.tag(
      'LoadedQuestions',
      ({ questions }) =>
        Array.filter(questions, question => isListed(question, filter)).length,
    ),
    M.orElse(() => 0),
  )
