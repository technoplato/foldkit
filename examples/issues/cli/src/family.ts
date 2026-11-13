import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Result,
  Schema as S,
} from 'effect'
import {
  IssueChildren,
  childrenProgressLabel,
  issueChildrenOf,
  issueChildrenQuery,
} from 'issues-core-example'

import { describeIssueTrackerCause } from '@foldkit/instant-tools/issues'

import { type ScribeQuery, buildJobsTimeout, oneLine } from './builds.js'

// An epic's children as `issues show` prints them (Scribe #2348): read from
// Scribe's rows by the one query core's issueChildrenQuery names, so the
// command, its --json and the Issue page ask the schema the same question.

/** Scribe answered: the Issues under the epic, open first, and how many are done. */
export const FoundIssueChildren = S.TaggedStruct('FoundIssueChildren', {
  children: IssueChildren,
})

/**
 * The children could not be read, and why, such as
 * `the children query to Scribe's Instant app failed: ...`.
 */
export const UnavailableIssueChildren = S.TaggedStruct(
  'UnavailableIssueChildren',
  { reason: S.String },
)

/** What `issues show` learned of the Issues under an Issue. */
export const IssueChildrenRead = S.Union([
  FoundIssueChildren,
  UnavailableIssueChildren,
])
/** What `issues show` learned of the Issues under an Issue. */
export type IssueChildrenRead = typeof IssueChildrenRead.Type

/**
 * Reads the Issues under an Issue by its number, such as 2347. It never fails:
 * children that cannot be read are `UnavailableIssueChildren` with the reason.
 */
export type IssueChildrenReader = (
  issueNumber: number,
) => Effect.Effect<IssueChildrenRead>

/**
 * Reads the Issues under an Issue from Scribe's Instant app with `send`,
 * waiting at most `timeout` (5 seconds, the bound on every wait). It never
 * fails: a refused query (such as one asking for `parentNumber` before Scribe's
 * schema has it), no answer, or rows that do not read are
 * `UnavailableIssueChildren` with the reason.
 */
export const readIssueChildren = (
  send: ScribeQuery,
  issueNumber: number,
  timeout: Duration.Duration = buildJobsTimeout,
): Effect.Effect<IssueChildrenRead> =>
  Effect.tryPromise({
    try: signal => send(issueChildrenQuery(issueNumber), signal),
    catch: describeIssueTrackerCause,
  }).pipe(
    Effect.timeoutOption(timeout),
    Effect.map(maybeAnswer =>
      Option.match(maybeAnswer, {
        onNone: () =>
          UnavailableIssueChildren.make({
            reason: `Scribe's Instant app did not answer within ${Duration.toSeconds(timeout).toString()} seconds.`,
          }),
        onSome: answer =>
          Result.match(
            Result.try(() => issueChildrenOf(answer)),
            {
              onFailure: () =>
                UnavailableIssueChildren.make({
                  reason:
                    "Scribe's Instant app answered with rows this command cannot read.",
                }),
              onSuccess: children => FoundIssueChildren.make({ children }),
            },
          ),
      }),
    ),
    Effect.catch(cause =>
      Effect.succeed(
        UnavailableIssueChildren.make({
          reason: `the children query to Scribe's Instant app failed: ${oneLine(cause)}`,
        }),
      ),
    ),
  )

/**
 * The lines `issues show` prints for the Issues under an Issue: a blank line,
 * `Children (3 of 14 done)`, then each child as `#2332  InProgress  P1  <title>`,
 * the open ones first. Nothing for an Issue that is no epic and has none; one
 * line saying why when Scribe cannot be read.
 */
export const issueChildrenSection = (
  read: IssueChildrenRead,
  issueId: string,
  isEpic: boolean,
): ReadonlyArray<string> =>
  M.value(read).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      FoundIssueChildren: ({ children }) => {
        if (Array.isReadonlyArrayEmpty(children.children) && !isEpic) {
          return []
        }
        return [
          '',
          `Children (${childrenProgressLabel(children)})`,
          ...Array.match(children.children, {
            onEmpty: () => [
              `  No Issue sits under #${issueId} yet: issues parent <n> ${String(Number(issueId))}`,
            ],
            onNonEmpty: each =>
              Array.map(
                each,
                child =>
                  `  #${child.id}  ${child.status}  ${child.priority}  ${child.title}`,
              ),
          }),
        ]
      },
      UnavailableIssueChildren: ({ reason }) => [
        '',
        `Children not shown: ${reason}`,
      ],
    }),
  )

/** One child as `issues show --json` gives it. */
export type IssueChildJson = Readonly<{
  id: string
  issueType?: string
  number: number
  priority: string
  status: string
  title: string
}>

/**
 * The keys `issues show --json` adds for the Issues under an Issue: `children`
 * with `progress` and `issues`, or `childrenNotShown`, why they could not be
 * read.
 */
export const issueChildrenJson = (
  read: IssueChildrenRead,
): Readonly<{
  children?: Readonly<{
    issues: ReadonlyArray<IssueChildJson>
    progress: Readonly<{ done: number; total: number }>
  }>
  childrenNotShown?: string
}> =>
  M.value(read).pipe(
    M.tagsExhaustive({
      FoundIssueChildren: ({ children }) => ({
        children: {
          issues: Array.map(children.children, child => ({
            id: child.id,
            ...Option.match(child.maybeIssueType, {
              onNone: () => ({}),
              onSome: issueType => ({ issueType }),
            }),
            number: child.number,
            priority: child.priority,
            status: child.status,
            title: child.title,
          })),
          progress: { done: children.done, total: children.total },
        },
      }),
      UnavailableIssueChildren: ({ reason }) => ({ childrenNotShown: reason }),
    }),
  )

/** A reader for hosts with no Scribe app: no child, nothing said. */
export const noIssueChildrenReader: IssueChildrenReader = () =>
  Effect.succeed(
    FoundIssueChildren.make({
      children: IssueChildren.make({ children: [], done: 0, total: 0 }),
    }),
  )
