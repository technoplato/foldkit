import { Array, Option, Order } from 'effect'

import {
  type Issue,
  type IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

/**
 * The work-log state of a question for the tracker's owner:
 * `issues log 2237 question "May the pricing page go public? …"`.
 */
export const QUESTION_STATE = 'question'

/**
 * The work-log state of the owner's answer, in their words:
 * `issues log 2237 answer "He typed: not yet."`.
 */
export const ANSWER_STATE = 'answer'

const hasState = (entry: IssueWorkLogEntry, state: string): boolean =>
  Option.contains(entry.state, state)

const oldestFirst: Order.Order<IssueWorkLogEntry> = Order.mapInput(
  Order.Number,
  (entry: IssueWorkLogEntry) => entry.occurredAtMs,
)

/**
 * The questions an Issue at `NeedsUserInput` waits on, oldest first: its
 * `question` work-log entries written after its newest `answer` entry. An
 * Issue with a question about the price and one about publishing holds both
 * until an answer is logged; one in any other status holds none.
 */
export const openQuestionsOf = (
  issue: Issue,
): ReadonlyArray<IssueWorkLogEntry> => {
  if (issue.status !== 'NeedsUserInput') {
    return []
  } else {
    const lastAnsweredAtMs = Array.reduce(
      issue.workLog,
      Number.NEGATIVE_INFINITY,
      (latest, entry) =>
        hasState(entry, ANSWER_STATE)
          ? Math.max(latest, entry.occurredAtMs)
          : latest,
    )
    return Array.sort(
      Array.filter(
        issue.workLog,
        entry =>
          hasState(entry, QUESTION_STATE) &&
          entry.occurredAtMs > lastAnsweredAtMs,
      ),
      oldestFirst,
    )
  }
}

const LINE_BREAK = '\n'

/** A question's lines as written, blank ones left out. */
export const questionLinesOf = (
  question: IssueWorkLogEntry,
): ReadonlyArray<string> =>
  Array.filter(
    Array.map(question.summary.split(LINE_BREAK), line => line.trim()),
    line => line !== '',
  )

const askedLine = (question: IssueWorkLogEntry): string =>
  Option.match(question.agentId, {
    onNone: () => `Asked ${new Date(question.occurredAtMs).toISOString()}`,
    onSome: agent =>
      `Asked by ${agent}, ${new Date(question.occurredAtMs).toISOString()}`,
  })

/**
 * The Needs user input block of an Issue, one line each: every open question
 * whole, then who asked it and when. An Issue at `NeedsUserInput` with no
 * question written says how to write one; an Issue in any other status has
 * no block.
 */
export const needsUserInputLines = (issue: Issue): ReadonlyArray<string> => {
  if (issue.status !== 'NeedsUserInput') {
    return []
  } else {
    return Array.match(openQuestionsOf(issue), {
      onEmpty: () => [
        `No question is written on this Issue yet: issues log ${issue.id} question "<the question, its options, the recommended one first>"`,
      ],
      onNonEmpty: questions =>
        Array.flatMap(questions, question => [
          ...questionLinesOf(question),
          askedLine(question),
        ]),
    })
  }
}
