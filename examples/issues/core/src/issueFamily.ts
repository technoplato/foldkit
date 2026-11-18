import { Array, Option, Order, Schema as S, pipe } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { FINISHED_STATUSES } from './backlog.js'
import { OptionalText, issueIdOfNumber } from './storedRows.js'

// An epic and its children (Scribe #2348). A child names its epic in the
// tracker (`Issue.parentIssueId`); Scribe's tracker mirror copies it onto the
// child's row as `issues.parentNumber`. One query reads an epic's children from
// those rows, so `issues show`, its --json and the Issue page ask the schema
// the same question and no list of children is kept anywhere.

// MODEL

/** The issue type that makes an Issue an epic, a parent other Issues sit under. */
export const EPIC_ISSUE_TYPE = 'epic'

/** One Issue under an epic, as Scribe's rows hold it: `#2332  InProgress  P1  QR sign-in`. */
export const IssueChild = S.Struct({
  id: S.String,
  maybeIssueType: S.Option(S.String),
  number: S.Number,
  priority: S.String,
  status: S.String,
  title: S.String,
})
/** One Issue under an epic. */
export type IssueChild = typeof IssueChild.Type

/**
 * The Issues under an epic, the open ones first and then the finished, each by
 * number, with how many are finished: 3 of 14 done.
 */
export const IssueChildren = S.Struct({
  children: S.Array(IssueChild),
  done: S.Number,
  total: S.Number,
})
/** The Issues under an epic. */
export type IssueChildren = typeof IssueChildren.Type

/** True for an Issue of type epic. */
export const isEpic = (issue: Issue): boolean =>
  Option.contains(issue.issueType, EPIC_ISSUE_TYPE)

/** True for the statuses that end an Issue's work: Closed, Fixed, Resolved and Verified. */
export const isFinishedStatus = (status: string): boolean =>
  Array.some(FINISHED_STATUSES, finished => finished === status)

/** How far an epic is: `3 of 14 done`. */
export const childrenProgressLabel = (children: IssueChildren): string =>
  `${children.done.toString()} of ${children.total.toString()} done`

// QUERY

const CHILD_FIELDS = ['number', 'title', 'status', 'priority', 'issueType']

/**
 * What to ask Scribe's app for an epic's children, by its number: every
 * `issues` row whose `parentNumber` is that number. #2347 asks `issues` where
 * `parentNumber` is 2347.
 */
export const issueChildrenQuery = (issueNumber: number) => ({
  issues: {
    $: {
      where: { parentNumber: issueNumber },
      fields: CHILD_FIELDS,
    },
  },
})

// STORED

const StoredChild = S.Struct({
  issueType: OptionalText,
  number: S.Number,
  priority: S.String,
  status: S.String,
  title: S.String,
})

const StoredChildren = S.Struct({ issues: S.Array(StoredChild) })

const openFirstThenByNumber: Order.Order<IssueChild> = Order.combine(
  Order.mapInput(Order.Boolean, (child: IssueChild) =>
    isFinishedStatus(child.status),
  ),
  Order.mapInput(Order.Number, (child: IssueChild) => child.number),
)

/**
 * An epic's children from the rows Instant answers `issueChildrenQuery` with:
 * the open ones first, then the finished, each by number, and how many are
 * finished. Rows that do not read are refused.
 */
export const issueChildrenOf = (data: unknown): IssueChildren => {
  const children = pipe(
    S.decodeUnknownSync(StoredChildren)(data).issues,
    Array.map(stored =>
      IssueChild.make({
        id: issueIdOfNumber(stored.number),
        maybeIssueType: Option.filter(
          Option.fromNullishOr(stored.issueType),
          issueType => issueType.trim() !== '',
        ),
        number: stored.number,
        priority: stored.priority,
        status: stored.status,
        title: stored.title,
      }),
    ),
    Array.sort(openFirstThenByNumber),
  )
  return IssueChildren.make({
    children,
    done: Array.filter(children, child => isFinishedStatus(child.status))
      .length,
    total: children.length,
  })
}
