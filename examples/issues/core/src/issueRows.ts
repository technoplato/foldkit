import { Array, Option } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type DecisionRow } from './decisionFacts.js'
import { linksOfIssue } from './entityGraph.js'
import { type QuestionRow } from './questionFacts.js'
import { type ReminderRow, issueIdOfReminder } from './reminderFacts.js'

const SHORT_ROW_ID = 8

const citedIdsMemo = new WeakMap<Issue, ReadonlySet<string>>()

const citedIdOf = (
  target: ReturnType<typeof linksOfIssue>[number]['target'],
): ReadonlyArray<string> => {
  if (target._tag === 'DecisionEntity') {
    return [target.decisionId.slice(0, SHORT_ROW_ID)]
  } else if (target._tag === 'QuestionEntity') {
    return [target.questionId.slice(0, SHORT_ROW_ID)]
  } else if (target._tag === 'ReminderEntity') {
    return [target.reminderId.slice(0, SHORT_ROW_ID)]
  } else if (target._tag === 'RawIdEntity') {
    return [target.id.slice(0, SHORT_ROW_ID)]
  }
  return []
}

const citedIdsOf = (issue: Issue): ReadonlySet<string> =>
  Option.getOrElse(Option.fromUndefinedOr(citedIdsMemo.get(issue)), () => {
    const cited = new Set(
      Array.flatMap(linksOfIssue(issue), link => citedIdOf(link.target)),
    )
    citedIdsMemo.set(issue, cited)
    return cited
  })

type RowsOfIssue<Row> = (
  rows: ReadonlyArray<Row>,
  issue: Issue,
) => ReadonlyArray<Row>

/**
 * The rows that name an Issue or that its words cite, in the rows' own order.
 * Read once per list of rows and Issue, so a live change to an Issue reads that
 * Issue's rows, and a change to a row reads the open Issue's.
 */
const rowsOfIssueBy = <Row extends object>(
  shortIdOf: (row: Row) => string,
  isNamedBy: (row: Row, issue: Issue) => boolean,
): RowsOfIssue<Row> => {
  const memo = new WeakMap<
    ReadonlyArray<Row>,
    WeakMap<Issue, ReadonlyArray<Row>>
  >()
  return (rows, issue) => {
    const byIssue = Option.getOrElse(
      Option.fromUndefinedOr(memo.get(rows)),
      () => {
        const fresh = new WeakMap<Issue, ReadonlyArray<Row>>()
        memo.set(rows, fresh)
        return fresh
      },
    )
    return Option.getOrElse(Option.fromUndefinedOr(byIssue.get(issue)), () => {
      const cited = citedIdsOf(issue)
      const found = Array.filter(
        rows,
        row => isNamedBy(row, issue) || cited.has(shortIdOf(row)),
      )
      byIssue.set(issue, found)
      return found
    })
  }
}

/** The decisions that name an Issue or that its words cite, the newest first. */
export const decisionsOfIssue = rowsOfIssueBy<DecisionRow>(
  decision => decision.decisionId.slice(0, SHORT_ROW_ID),
  (decision, issue) => decision.issueIds.includes(issue.id),
)

/** The questions that name an Issue or that its words cite, the newest first. */
export const questionsOfIssue = rowsOfIssueBy<QuestionRow>(
  question => question.questionId.slice(0, SHORT_ROW_ID),
  (question, issue) => question.issueIds.includes(issue.id),
)

/**
 * The reminders an Issue's words cite, or whose link is its page, the newest
 * first. Nothing else ties a reminder to an Issue: `Receipt #1520` in a
 * reminder's notes is not Issue 1520.
 */
export const remindersOfIssue = rowsOfIssueBy<ReminderRow>(
  reminder => reminder.reminderId.slice(0, SHORT_ROW_ID),
  (reminder, issue) => Option.contains(issueIdOfReminder(reminder), issue.id),
)
