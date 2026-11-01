import { Array, Match as M, Option } from 'effect'
import {
  Column,
  Plain,
  Reference,
  RichText,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import {
  type ChipContext,
  chipContextOf,
  chipFactsOf,
  partsOfText,
} from './chips.js'
import { durationLabel } from './clock.js'
import { type ChipClock, spacedChips, whenWordsOn } from './graphChips.js'
import { headedSection } from './graphPageParts.js'
import { loadedIssuesIn } from './listing.js'
import { type Model, type QuestionFilter, Questions } from './model.js'
import {
  issueChipsOf,
  issueIdsInText,
  momentNodes,
  rememberedRowsOf,
} from './momentParts.js'
import {
  type QuestionAnswer,
  type QuestionFacts,
  type QuestionRow,
} from './questionFacts.js'
import { navigationToPath } from './route.js'
import { questionIdChip } from './rowChips.js'

const STATUS_ORDER = ['open', 'answered', 'dismissed']
const MICHAEL = 'michael'

const pathOf = (filter: QuestionFilter): string =>
  navigationToPath(Questions.make({ filter }))

const noFilter: QuestionFilter = {
  isLearningOnly: false,
  maybeStatus: Option.none(),
}

const countChip = (
  label: string,
  count: number,
  isChosen: boolean,
  filter: QuestionFilter,
): TextPart =>
  Reference({
    label,
    title: count.toLocaleString('en-US'),
    ...(isChosen ? { state: 'shown' } : {}),
    kind: 'Question',
    href: pathOf(filter),
    detail: [`${count.toLocaleString('en-US')} questions`],
  })

const questionCountWords = (count: number): string =>
  count === 1 ? '1 question' : `${count.toLocaleString('en-US')} questions`

const isFiltered = (filter: QuestionFilter): boolean =>
  filter.isLearningOnly || Option.isSome(filter.maybeStatus)

const shownWords = (
  shown: number,
  total: number,
  filter: QuestionFilter,
): string =>
  isFiltered(filter)
    ? `${shown.toLocaleString('en-US')} of ${questionCountWords(total)}`
    : questionCountWords(total)

const countsNodes = (
  questions: ReadonlyArray<QuestionRow>,
  filter: QuestionFilter,
): ReadonlyArray<UiNode> => [
  RichText([
    Plain('State'),
    ...spacedChips([
      ...Array.flatMap(STATUS_ORDER, status => {
        const count = Array.filter(
          questions,
          question => question.status === status,
        ).length
        return count === 0
          ? []
          : [
              countChip(
                status,
                count,
                Option.contains(filter.maybeStatus, status),
                { ...noFilter, maybeStatus: Option.some(status) },
              ),
            ]
      }),
      countChip(
        'To learn',
        Array.filter(questions, question => question.isLearning).length,
        filter.isLearningOnly,
        { ...noFilter, isLearningOnly: true },
      ),
      ...(isFiltered(filter)
        ? [countChip('All', questions.length, false, noFilter)]
        : []),
    ]),
  ]),
]

const rememberedRow = rememberedRowsOf<QuestionRow>()

const learningWords = (question: QuestionRow): string =>
  question.isLearning ? '  To learn' : ''

const questionRow = (
  question: QuestionRow,
  context: ChipContext,
  clock: ChipClock,
): UiNode =>
  rememberedRow(
    question,
    [...question.issueIds, ...issueIdsInText(question.text)],
    context,
    clock,
    () =>
      Column(
        { gap: 0 },
        RichText([
          questionIdChip(question, clock),
          Plain(
            `  ${whenWordsOn(question.askedAtMs, clock)}${learningWords(question)}`,
          ),
          ...spacedChips(issueChipsOf(question.issueIds, context)),
        ]),
        RichText(partsOfText(question.text, context)),
      ),
  )

const matches = (filter: QuestionFilter, question: QuestionRow): boolean =>
  (!filter.isLearningOnly || question.isLearning) &&
  Option.getOrElse(
    Option.map(filter.maybeStatus, status => status === question.status),
    () => true,
  )

const loadedNodes = (
  model: Model,
  questions: ReadonlyArray<QuestionRow>,
  filter: QuestionFilter,
): ReadonlyArray<UiNode> => {
  const context = chipContextOf(
    loadedIssuesIn(model),
    model.clock.nowMs,
    model.clock.timeZone,
    chipFactsOf(model),
  )
  const shown = Array.filter(questions, question => matches(filter, question))
  return [
    Text(shownWords(shown.length, questions.length, filter), { dim: true }),
    ...countsNodes(questions, filter),
    ...Array.map(shown, question =>
      questionRow(question, context, model.clock),
    ),
  ]
}

/**
 * What he asked, every one of them, the newest first: how many there are in
 * each state and to learn, each count a link that shows just those, then each
 * question with its state, when, the Issues it names and its sentence.
 */
export const questionsPageNodes = (
  model: Model,
  filter: QuestionFilter,
): ReadonlyArray<UiNode> => [
  Text('Questions', { emphasis: 'Headline' }),
  ...M.value(model.questionsList).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingQuestions: () => [Text('Observing…')],
      FailedQuestions: ({ reason }) => [
        Text(`Scribe’s rows could not be read: ${reason}`, { dim: true }),
      ],
      LoadedQuestions: ({ questions }) => loadedNodes(model, questions, filter),
    }),
  ),
]

const askerWords = (question: QuestionRow): string =>
  question.askedBy === MICHAEL
    ? 'Asked by him'
    : `Asked by ${Option.getOrElse(question.maybeAskerName, () => 'an agent')}`

const answererWords = (answer: QuestionAnswer): string =>
  answer.answeredBy === MICHAEL
    ? answer.answererName
    : `${answer.answererName} (${answer.answeredBy})`

const answerNodes = (
  answer: QuestionAnswer,
  question: QuestionRow,
  context: ChipContext,
  clock: ChipClock,
): UiNode =>
  Column(
    { gap: 0 },
    RichText(partsOfText(answer.text, context)),
    RichText(
      [
        Plain(
          `${answererWords(answer)}  ${whenWordsOn(answer.answeredAtMs, clock)}, ${durationLabel(question.askedAtMs, answer.answeredAtMs)} after he asked`,
        ),
        ...Option.match(answer.maybeUrl, {
          onNone: () => [],
          onSome: url => spacedChips(partsOfText(url, context)),
        }),
      ],
      { dim: true },
    ),
  )

/**
 * What Scribe's rows say about one question: the sentence, who asked and when,
 * his exact words with a link to each moment, every answer with who gave it and
 * how soon, the Issues it names, and what the listener made of it.
 */
export const questionFactNodes = (
  facts: QuestionFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const { question } = facts
  return [
    Text(question.text, { emphasis: 'Headline' }),
    RichText([
      questionIdChip(question, clock),
      Plain(
        `  ${askerWords(question)}  ${whenWordsOn(question.askedAtMs, clock)}${learningWords(question)}`,
      ),
    ]),
    ...headedSection(
      facts.moments.length === 1
        ? 'His words'
        : `His words: ${facts.moments.length.toString()} moments`,
      Array.map(facts.moments, moment => momentNodes(moment, context, clock)),
    ),
    ...headedSection(
      `Answers: ${facts.answers.length.toString()}`,
      Array.map(facts.answers, answer =>
        answerNodes(answer, question, context, clock),
      ),
    ),
    ...headedSection(
      'Issues it names',
      Array.isReadonlyArrayEmpty(question.issueIds)
        ? []
        : Array.map(issueChipsOf(question.issueIds, context), chip =>
            RichText([chip]),
          ),
    ),
    ...Option.toArray(
      Option.map(facts.maybeNote, note =>
        RichText(partsOfText(note, context), { dim: true }),
      ),
    ),
  ]
}
