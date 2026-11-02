import { Array, Match as M, Option, Order, Schema as S } from 'effect'

import {
  type Issue,
  type IssueMention,
  type IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { recordingNumberOfMention } from './mentionedIn.js'

// MODEL

/** What happened to an Issue: its status moved, it was claimed, or it was mentioned. */
export const InboxKind = S.Literals(['Status', 'Claim', 'Mention'])
/** What happened to an Issue. */
export type InboxKind = typeof InboxKind.Type

/** Which of an inbox's changes show: `/inbox?kind=status`. */
export const InboxFilter = S.Literals(['All', 'Status', 'Claim', 'Mention'])
/** Which of an inbox's changes show. */
export type InboxFilter = typeof InboxFilter.Type

/**
 * One thing that happened, read from what an Issue stores: a `status`,
 * `claimed` or `released` work-log entry, or a mention with its time. `key`
 * is `101/work-101-status-9000`: stored ids repeat, across Issues and inside
 * one, so a second `mention-1` on #261 is `261/mention-1/2`.
 */
export type InboxItem = Readonly<{
  atMs: number
  issue: Issue
  key: string
  kind: InboxKind
  maybeWho: Option.Option<string>
  words: string
}>

// READ

const STATUS_STATE = 'status'
const CLAIM_STATES: ReadonlyArray<string> = [
  'claimed',
  'claim-start',
  'released',
]

const LINE_BREAK = '\n'

const firstLineOf = (text: string): string =>
  Option.getOrElse(Array.head(text.split(LINE_BREAK)), () => text)

const kindOfEntry = (entry: IssueWorkLogEntry): Option.Option<InboxKind> =>
  Option.flatMap(entry.state, state => {
    if (state === STATUS_STATE) {
      return Option.some('Status' as const)
    } else if (Array.contains(CLAIM_STATES, state)) {
      return Option.some('Claim' as const)
    } else {
      return Option.none()
    }
  })

const itemsOfWorkLog = (issue: Issue): ReadonlyArray<InboxItem> =>
  Array.flatMap(issue.workLog, entry =>
    Option.match(kindOfEntry(entry), {
      onNone: () => [],
      onSome: kind => [
        {
          atMs: entry.occurredAtMs,
          issue,
          key: entry.id,
          kind,
          maybeWho: entry.agentId,
          words: firstLineOf(entry.summary),
        },
      ],
    }),
  )

const mentionSourceWords = (mention: IssueMention): Option.Option<string> =>
  M.value(mention.source).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('Recording', () =>
      Option.map(
        recordingNumberOfMention(mention),
        recordingNumber => `Recording ${recordingNumber.toString()}`,
      ),
    ),
    M.tag('Conversation', () => Option.some('Typed')),
    M.tag('Agent', agent => Option.some(agent.id)),
    M.orElse(() => Option.none()),
  )

const itemsOfMentions = (issue: Issue): ReadonlyArray<InboxItem> =>
  Array.flatMap(issue.mentions, mention =>
    Option.match(mention.capturedAtMs, {
      onNone: () => [],
      onSome: atMs => [
        {
          atMs,
          issue,
          key: mention.id,
          kind: 'Mention' as const,
          maybeWho: mentionSourceWords(mention),
          words: firstLineOf(
            Option.getOrElse(
              Option.orElse(mention.directQuote, () => mention.note),
              () => '',
            ),
          ),
        },
      ],
    }),
  )

const withUniqueKeys = (
  issue: Issue,
  items: ReadonlyArray<InboxItem>,
): ReadonlyArray<InboxItem> => {
  const seen = new Map<string, number>()
  return Array.map(items, item => {
    const earlier = seen.get(item.key) ?? 0
    seen.set(item.key, earlier + 1)
    return {
      ...item,
      key:
        earlier === 0
          ? `${issue.id}/${item.key}`
          : `${issue.id}/${item.key}/${(earlier + 1).toString()}`,
    }
  })
}

const itemsByIssue = new WeakMap<Issue, ReadonlyArray<InboxItem>>()

const itemsOfIssue = (issue: Issue): ReadonlyArray<InboxItem> =>
  Option.getOrElse(Option.fromUndefinedOr(itemsByIssue.get(issue)), () => {
    const items = withUniqueKeys(issue, [
      ...itemsOfWorkLog(issue),
      ...itemsOfMentions(issue),
    ])
    itemsByIssue.set(issue, items)
    return items
  })

const NewestFirst: Order.Order<InboxItem> = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (item: InboxItem) => item.atMs),
  Order.mapInput(Order.String, (item: InboxItem) => item.key),
)

const mergedNewestFirst = (
  kept: ReadonlyArray<InboxItem>,
  fresh: ReadonlyArray<InboxItem>,
): ReadonlyArray<InboxItem> => {
  const merged: Array<InboxItem> = []
  let freshAt = 0
  Array.forEach(kept, item => {
    while (
      Option.exists(
        Array.get(fresh, freshAt),
        next => NewestFirst(next, item) < 0,
      )
    ) {
      Option.map(Array.get(fresh, freshAt), next => merged.push(next))
      freshAt += 1
    }
    merged.push(item)
  })
  return [...merged, ...fresh.slice(freshAt)]
}

type InboxRead = Readonly<{
  issues: ReadonlyArray<Issue>
  items: ReadonlyArray<InboxItem>
  byId: ReadonlyMap<string, Issue>
}>

const lastRead: { current: InboxRead } = {
  current: { byId: new Map(), issues: [], items: [] },
}

const readOf = (
  previous: InboxRead,
  issues: ReadonlyArray<Issue>,
): InboxRead => {
  const byId = new Map(Array.map(issues, issue => [issue.id, issue]))
  const changed = Array.filter(
    issues,
    issue => previous.byId.get(issue.id) !== issue,
  )
  const kept = Array.filter(
    previous.items,
    item => byId.get(item.issue.id) === item.issue,
  )
  const fresh = Array.sort(Array.flatMap(changed, itemsOfIssue), NewestFirst)
  return { byId, issues, items: mergedNewestFirst(kept, fresh) }
}

/**
 * Everything that happened to the Issues, newest first. Each Issue is read
 * once per Issue object, and a new snapshot takes out the items of the Issues
 * that changed and merges theirs back in, so a live change sorts only what it
 * changed.
 */
export const inboxItemsOf = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<InboxItem> => {
  if (lastRead.current.issues !== issues) {
    lastRead.current = readOf(lastRead.current, issues)
  }
  return lastRead.current.items
}

/** The items a kind shows. */
export const itemsOfKind = (
  items: ReadonlyArray<InboxItem>,
  filter: InboxFilter,
): ReadonlyArray<InboxItem> =>
  filter === 'All' ? items : Array.filter(items, item => item.kind === filter)
