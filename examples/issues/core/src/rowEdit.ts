import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  type Issue,
  IssuePriority,
  IssueStatus,
  TrackedProduct,
} from '@foldkit/instant-tools/issues'

// MODEL

/** The status changes: `Blocked`. */
export const ChangedStatus = S.TaggedStruct('ChangedStatus', {
  status: IssueStatus,
})
/** The priority changes: `P1`. */
export const ChangedPriority = S.TaggedStruct('ChangedPriority', {
  priority: IssuePriority,
})
/** The Issue moves to another product: Foldkit. */
export const ChangedProduct = S.TaggedStruct('ChangedProduct', {
  product: TrackedProduct,
})
/** The person signed in claims the Issue, which moves it to InProgress. */
export const ClaimedByAuthor = S.TaggedStruct('ClaimedByAuthor', {})
/** Someone who holds a claim takes this Issue too, moving it to InProgress. */
export const ClaimedFor = S.TaggedStruct('ClaimedFor', { claimantId: S.String })
/** The Issue's claim is let go. */
export const ReleasedClaim = S.TaggedStruct('ReleasedClaim', {})
/** One change a person makes to an Issue from where they read it. */
export const RowChange = S.Union([
  ChangedStatus,
  ChangedPriority,
  ChangedProduct,
  ClaimedByAuthor,
  ClaimedFor,
  ReleasedClaim,
])
/** One change a person makes to an Issue from where they read it. */
export type RowChange = typeof RowChange.Type

/** One change to one Issue, shown at once and written in its turn. */
export const RowEdit = S.Struct({ change: RowChange, issueId: S.String })
/** One change to one Issue, shown at once and written in its turn. */
export type RowEdit = typeof RowEdit.Type

/** A change that did not save, and the reason. */
export const FailedRowEdit = S.Struct({ edit: RowEdit, reason: S.String })
/** A change that did not save, and the reason. */
export type FailedRowEdit = typeof FailedRowEdit.Type

// SHOWN

const AUTHOR_WORD = 'me'
const CLAIMED_STATUS: IssueStatus = 'InProgress'

/**
 * An Issue as it reads with one change applied, without a Schema parse: the
 * row shows this until the write comes back.
 */
export const issueWithChange = (issue: Issue, change: RowChange): Issue =>
  M.value(change).pipe(
    M.withReturnType<Issue>(),
    M.tagsExhaustive({
      ChangedStatus: ({ status }) => ({ ...issue, status }),
      ChangedPriority: ({ priority }) => ({ ...issue, priority }),
      ChangedProduct: ({ product }) => ({ ...issue, product }),
      ClaimedByAuthor: () => ({
        ...issue,
        claimantId: Option.some(AUTHOR_WORD),
        status: CLAIMED_STATUS,
      }),
      ClaimedFor: ({ claimantId }) => ({
        ...issue,
        claimantId: Option.some(claimantId),
        status: CLAIMED_STATUS,
      }),
      ReleasedClaim: () => ({ ...issue, claimantId: Option.none() }),
    }),
  )

const SHOWN_CHANGE_SEPARATOR = '\n'

const editedIssues = new WeakMap<Issue, Map<string, Issue>>()

const changeKeys = new WeakMap<RowChange, string>()

const changeKeyOf = (change: RowChange): string =>
  Option.getOrElse(Option.fromUndefinedOr(changeKeys.get(change)), () => {
    const key = rowChangeWords(change)
    changeKeys.set(change, key)
    return key
  })

const issueWithChanges = (
  issue: Issue,
  changes: ReadonlyArray<RowChange>,
): Issue => {
  const shown = Option.getOrElse(
    Option.fromUndefinedOr(editedIssues.get(issue)),
    () => {
      const fresh = new Map<string, Issue>()
      editedIssues.set(issue, fresh)
      return fresh
    },
  )
  const key = Array.join(
    Array.map(changes, changeKeyOf),
    SHOWN_CHANGE_SEPARATOR,
  )
  return Option.getOrElse(Option.fromUndefinedOr(shown.get(key)), () => {
    const edited = Array.reduce(changes, issue, issueWithChange)
    shown.set(key, edited)
    return edited
  })
}

/** An Issue as it reads with the changes that wait for its write applied. */
export const issueWithEdits = (
  issue: Issue,
  edits: ReadonlyArray<RowEdit>,
): Issue =>
  Array.match(
    Array.filter(edits, edit => edit.issueId === issue.id),
    {
      onEmpty: () => issue,
      onNonEmpty: own =>
        issueWithChanges(
          issue,
          Array.map(own, edit => edit.change),
        ),
    },
  )

type ShownIssues = Readonly<{
  edits: ReadonlyArray<RowEdit>
  shown: ReadonlyArray<Issue>
}>

const shownIssuesBySnapshot = new WeakMap<ReadonlyArray<Issue>, ShownIssues>()

const changesByIssue = (
  edits: ReadonlyArray<RowEdit>,
): ReadonlyMap<string, ReadonlyArray<RowChange>> => {
  const changes = new Map<string, Array<RowChange>>()
  Array.forEach(edits, ({ change, issueId }) => {
    const own = changes.get(issueId)
    if (own === undefined) {
      changes.set(issueId, [change])
    } else {
      own.push(change)
    }
  })
  return changes
}

/**
 * The loaded Issues as a person reads them: each change that waits for its
 * write shows at once. With nothing waiting they are the same array, and with
 * something waiting an Issue whose waiting changes stay the same keeps its
 * object and its row, so each of 1,500 writes in a bulk change paints one row.
 */
export const issuesWithEdits = (
  issues: ReadonlyArray<Issue>,
  edits: ReadonlyArray<RowEdit>,
): ReadonlyArray<Issue> => {
  if (Array.isReadonlyArrayEmpty(edits)) {
    return issues
  } else {
    const cached = shownIssuesBySnapshot.get(issues)
    if (cached !== undefined && cached.edits === edits) {
      return cached.shown
    } else {
      const changes = changesByIssue(edits)
      const shown = Array.map(issues, issue =>
        Option.match(Option.fromUndefinedOr(changes.get(issue.id)), {
          onNone: () => issue,
          onSome: own => issueWithChanges(issue, own),
        }),
      )
      shownIssuesBySnapshot.set(issues, { edits, shown })
      return shown
    }
  }
}

/** A change in words: `status Blocked`, `product Foldkit`, `claim`. */
export const rowChangeWords = (change: RowChange): string =>
  M.value(change).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ChangedStatus: ({ status }) => `status ${status}`,
      ChangedPriority: ({ priority }) => `priority ${priority}`,
      ChangedProduct: ({ product }) => `product ${product.name}`,
      ClaimedByAuthor: () => 'claim',
      ClaimedFor: ({ claimantId }) => `claim for ${claimantId}`,
      ReleasedClaim: () => 'release of the claim',
    }),
  )
