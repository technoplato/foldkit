import { Option } from 'effect'
import { Reference, type TextPart } from 'foldkit/renderers'

import { type DecisionRow } from './decisionFacts.js'
import { type ChipClock, whenWordsOn } from './graphChips.js'
import { type QuestionRow } from './questionFacts.js'
import { type ReminderRow } from './reminderFacts.js'

const SHORT_ROW_ID_LENGTH = 8
const TITLE_LIMIT = 80

/** Words cut to a limit, with `…` where they stop. */
export const shortened = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`

const CANDIDATE = 'unconfirmed'

const decisionWhenWords = (decision: DecisionRow, clock: ChipClock): string =>
  decision.status === CANDIDATE
    ? `A candidate, not his until he confirms it: ${whenWordsOn(decision.decidedAtMs, clock)}`
    : `Decided ${whenWordsOn(decision.decidedAtMs, clock)}`

const decisionReference = (decision: DecisionRow, clock: ChipClock) => ({
  label: `decision ${decision.decisionId.slice(0, SHORT_ROW_ID_LENGTH)}`,
  state: decision.status,
  kind: 'Decision',
  href: `/decisions/${decision.decisionId}`,
  detail: [decisionWhenWords(decision, clock), decision.text],
})

/**
 * A decision's chip: the first 8 characters agents cite, its sentence and its
 * state, so a cited decision that was superseded says so where it is cited.
 */
export const decisionChip = (
  decision: DecisionRow,
  clock: ChipClock,
): TextPart =>
  Reference({
    ...decisionReference(decision, clock),
    title: shortened(decision.text, TITLE_LIMIT),
  })

/** A decision's chip where its sentence stands beside it: a list, its page. */
export const decisionIdChip = (
  decision: DecisionRow,
  clock: ChipClock,
): TextPart => Reference(decisionReference(decision, clock))

/** A decision known only by the id the text gave, until its row is read. */
export const decisionChipOf = (decisionId: string): TextPart =>
  Reference({
    label: `decision ${decisionId.slice(0, SHORT_ROW_ID_LENGTH)}`,
    kind: 'Decision',
    href: `/decisions/${decisionId}`,
    detail: [`Decision ${decisionId}`],
  })

const questionReference = (question: QuestionRow, clock: ChipClock) => ({
  label: `question ${question.questionId.slice(0, SHORT_ROW_ID_LENGTH)}`,
  state: question.status,
  kind: 'Question',
  href: `/questions/${question.questionId}`,
  detail: [`Asked ${whenWordsOn(question.askedAtMs, clock)}`, question.text],
})

/** A question's chip: the first 8 characters of its id, its sentence and state. */
export const questionChip = (
  question: QuestionRow,
  clock: ChipClock,
): TextPart =>
  Reference({
    ...questionReference(question, clock),
    title: shortened(question.text, TITLE_LIMIT),
  })

/** A question's chip where its sentence stands beside it: a list, its page. */
export const questionIdChip = (
  question: QuestionRow,
  clock: ChipClock,
): TextPart => Reference(questionReference(question, clock))

/** A question known only by the id the text gave, until its row is read. */
export const questionChipOf = (questionId: string): TextPart =>
  Reference({
    label: `question ${questionId.slice(0, SHORT_ROW_ID_LENGTH)}`,
    kind: 'Question',
    href: `/questions/${questionId}`,
    detail: [`Question ${questionId}`],
  })

const reminderReference = (reminder: ReminderRow, clock: ChipClock) => ({
  label: `reminder ${reminder.reminderId.slice(0, SHORT_ROW_ID_LENGTH)}`,
  state: reminder.state,
  kind: 'Reminder',
  href: `/reminders/${reminder.reminderId}`,
  detail: [
    `Made ${whenWordsOn(reminder.createdAtMs, clock)}`,
    ...Option.toArray(
      Option.map(
        reminder.maybeDueAtMs,
        dueAtMs => `Due ${whenWordsOn(dueAtMs, clock)}`,
      ),
    ),
  ],
})

/**
 * A reminder's chip: the first 8 characters of its id, its title and state,
 * for the one site behind Access to him alone.
 */
export const reminderChip = (
  reminder: ReminderRow,
  clock: ChipClock,
): TextPart =>
  Reference({
    ...reminderReference(reminder, clock),
    title: shortened(reminder.title, TITLE_LIMIT),
  })

/** A reminder's chip where its title stands beside it: a list, its page. */
export const reminderIdChip = (
  reminder: ReminderRow,
  clock: ChipClock,
): TextPart => Reference(reminderReference(reminder, clock))

/** A reminder known only by the id the text gave, until its row is read. */
export const reminderChipOf = (reminderId: string): TextPart =>
  Reference({
    label: `reminder ${reminderId.slice(0, SHORT_ROW_ID_LENGTH)}`,
    kind: 'Reminder',
    href: `/reminders/${reminderId}`,
    detail: [`Reminder ${reminderId}`],
  })
