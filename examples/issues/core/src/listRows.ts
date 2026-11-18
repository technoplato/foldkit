import { Array, Option, String } from 'effect'
import { Button, type ButtonNode, type ListItem } from 'foldkit/renderers'

import { type Issue, isWorkingNow } from '@foldkit/instant-tools/issues'

import { landingHeadline, subtaskProgress } from './landing.js'
import { leftoverKindOf } from './leftover.js'
import { type ChoiceMenu, IssueDetail } from './model.js'
import { navigationToPath } from './route.js'

/** A press on a row's box: `select:804`. */
export const SELECT_TOKEN_PREFIX = 'select:'
/** A press on a row's box with Shift held: `select-to:804`. */
export const SELECT_TO_TOKEN_PREFIX = 'select-to:'

const runningAgentWords = (issue: Issue): ReadonlyArray<string> =>
  isWorkingNow(issue)
    ? Option.toArray(
        Option.map(issue.agentPresence, presence =>
          Option.contains(issue.claimantId, presence.agentId)
            ? 'running'
            : `running ${presence.agentId}`,
        ),
      )
    : []

/**
 * The words under an Issue's title in a list row, in the order a reader
 * scans them: `#804`, then its kind and area when it has them, where its work
 * is, such as `Green for build 106`, and the agent running on it, such as
 * `running claude-code/issue-1374@max`, or `running` when that is who holds it.
 */
export const issueRowLines = (issue: Issue): ReadonlyArray<string> => [
  `#${issue.id}`,
  ...Option.toArray(leftoverKindOf(issue)),
  ...Option.toArray(issue.area),
  ...Option.toArray(Option.map(issue.workInProgress, landingHeadline)),
  ...(Array.isReadonlyArrayEmpty(issue.subtasks)
    ? []
    : [subtaskProgress(issue)]),
  ...runningAgentWords(issue),
]

const ROW_FIELD_TOKEN_PREFIX = 'field:'

const ROW_FIELD_WORDS: ReadonlyArray<readonly [string, ChoiceMenu]> = [
  ['status', 'SetStatus'],
  ['priority', 'SetPriority'],
  ['claim', 'SetClaim'],
  ['product', 'SetProduct'],
]

/**
 * What a press on a row's field names: `field:status:804` is the status of
 * #804. Any other token names none.
 */
export const rowFieldOfToken = (
  token: string,
): Option.Option<Readonly<{ issueId: string; menu: ChoiceMenu }>> =>
  token.startsWith(ROW_FIELD_TOKEN_PREFIX)
    ? Option.flatMap(
        Array.findFirst(ROW_FIELD_WORDS, ([word]) =>
          token.startsWith(`${ROW_FIELD_TOKEN_PREFIX}${word}:`),
        ),
        ([word, menu]) =>
          Option.liftPredicate(
            {
              issueId: token.slice(`${ROW_FIELD_TOKEN_PREFIX}${word}:`.length),
              menu,
            },
            ({ issueId }) => String.isNonEmpty(issueId),
          ),
      )
    : Option.none()

const UNCLAIMED_LABEL = 'Unclaimed'

/** Who holds an Issue, in the words its field shows: `Unclaimed` for no one. */
export const claimLabelOf = (issue: Issue): string =>
  Option.getOrElse(issue.claimantId, () => UNCLAIMED_LABEL)

const fieldButton = (token: string, label: string): ButtonNode =>
  Button({ label, token, variant: 'Ghost' })

const rowFieldsOf = (issue: Issue): ReadonlyArray<ButtonNode> => [
  fieldButton(`${ROW_FIELD_TOKEN_PREFIX}status:${issue.id}`, issue.status),
  fieldButton(`${ROW_FIELD_TOKEN_PREFIX}priority:${issue.id}`, issue.priority),
  fieldButton(
    `${ROW_FIELD_TOKEN_PREFIX}claim:${issue.id}`,
    claimLabelOf(issue),
  ),
  fieldButton(
    `${ROW_FIELD_TOKEN_PREFIX}product:${issue.id}`,
    issue.product.name,
  ),
]

/**
 * The fields at the top of an Issue's page, for the Issue on the page: status,
 * priority, who holds it and its product. Pressing one opens its choices.
 */
export const pageFieldsOf = (issue: Issue): ReadonlyArray<ButtonNode> => [
  fieldButton('menu:set-status', issue.status),
  fieldButton('menu:set-priority', issue.priority),
  fieldButton('menu:claim', claimLabelOf(issue)),
  fieldButton('menu:set-product', issue.product.name),
]

const rowByIssue = new WeakMap<Issue, ListItem>()

/**
 * One Issue's row in a list: a link to its page, `/issues/804`, with its
 * title and {@link issueRowLines}, then its fields, each a press that opens
 * its choices. The store keeps an unchanged Issue's decoded object across
 * live changes, so a row is built once per Issue object, and a live change to
 * one of 1,535 Issues builds one row.
 */
export const issueRowOf = (issue: Issue): ListItem =>
  Option.getOrElse(Option.fromUndefinedOr(rowByIssue.get(issue)), () => {
    const row: ListItem = {
      href: navigationToPath(IssueDetail.make({ issueId: issue.id })),
      key: issue.id,
      lines: issueRowLines(issue),
      title: issue.title,
      trailing: rowFieldsOf(issue),
    }
    rowByIssue.set(issue, row)
    return row
  })

const unselectedRows = new WeakMap<Issue, ListItem>()
const selectedRows = new WeakMap<Issue, ListItem>()

const rowWithCheck = (issue: Issue, isChecked: boolean): ListItem => ({
  ...issueRowOf(issue),
  check: {
    action: `${SELECT_TOKEN_PREFIX}${issue.id}`,
    extendAction: `${SELECT_TO_TOKEN_PREFIX}${issue.id}`,
    isChecked,
    label: `Select #${issue.id}`,
  },
})

/**
 * One Issue's row with the box that selects it. Built once per Issue object
 * and side of the box, so ticking a row paints that row and no other.
 */
export const selectableRowOf = (
  issue: Issue,
  isSelected: boolean,
): ListItem => {
  const rows = isSelected ? selectedRows : unselectedRows
  return Option.getOrElse(Option.fromUndefinedOr(rows.get(issue)), () => {
    const row = rowWithCheck(issue, isSelected)
    rows.set(issue, row)
    return row
  })
}

const cards = new WeakMap<ListItem, ListItem>()

/** One row as a card of a board, built once per row. */
export const cardOf = (row: ListItem): ListItem =>
  Option.getOrElse(Option.fromUndefinedOr(cards.get(row)), () => {
    const card = { ...row, isDraggable: true }
    cards.set(row, card)
    return card
  })

const currentRows = new WeakMap<ListItem, ListItem>()

/** One row marked as the one under the cursor, built once per row. */
export const currentRowOf = (row: ListItem): ListItem =>
  Option.getOrElse(Option.fromUndefinedOr(currentRows.get(row)), () => {
    const current = { ...row, isCurrent: true }
    currentRows.set(row, current)
    return current
  })

/** How many Issues a list holds: `1 Issue`, `1,535 Issues`. */
export const issueCountWords = (count: number): string =>
  count === 1 ? '1 Issue' : `${count.toLocaleString('en-US')} Issues`
