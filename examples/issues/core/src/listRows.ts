import { Option } from 'effect'
import { type ListItem } from 'foldkit/renderers'

import { type Issue, isWorkingNow } from '@foldkit/instant-tools/issues'

import { landingHeadline } from './landing.js'
import { leftoverKindOf } from './leftover.js'
import { IssueDetail } from './model.js'
import { navigationToPath } from './route.js'

const runningAgentWords = (issue: Issue): ReadonlyArray<string> =>
  isWorkingNow(issue)
    ? Option.toArray(
        Option.map(
          issue.agentPresence,
          presence => `running ${presence.agentId}`,
        ),
      )
    : []

/**
 * The words under an Issue's title in a list row, in the order a reader
 * scans them: `#804`, `P1`, `InProgress`, `Scribe`, then its kind, area and
 * claimant when it has them, where its work is, such as
 * `Green for build 106`, and the agent running on it, such as
 * `running claude-code/issue-1374@max`.
 */
export const issueRowLines = (issue: Issue): ReadonlyArray<string> => [
  `#${issue.id}`,
  issue.priority,
  issue.status,
  issue.product.name,
  ...Option.toArray(leftoverKindOf(issue)),
  ...Option.toArray(issue.area),
  ...Option.toArray(issue.claimantId),
  ...Option.toArray(Option.map(issue.workInProgress, landingHeadline)),
  ...runningAgentWords(issue),
]

const rowByIssue = new WeakMap<Issue, ListItem>()

/**
 * One Issue's row in a list: a link to its page, `/issues/804`, with its
 * title and {@link issueRowLines}. The store keeps an unchanged Issue's
 * decoded object across live changes, so a row is built once per Issue
 * object, and a live change to one of 1,535 Issues builds one row.
 */
export const issueRowOf = (issue: Issue): ListItem =>
  Option.getOrElse(Option.fromUndefinedOr(rowByIssue.get(issue)), () => {
    const row: ListItem = {
      href: navigationToPath(IssueDetail.make({ issueId: issue.id })),
      key: issue.id,
      lines: issueRowLines(issue),
      title: issue.title,
    }
    rowByIssue.set(issue, row)
    return row
  })

/** How many Issues a list holds: `1 Issue`, `1,535 Issues`. */
export const issueCountWords = (count: number): string =>
  count === 1 ? '1 Issue' : `${count.toLocaleString('en-US')} Issues`
