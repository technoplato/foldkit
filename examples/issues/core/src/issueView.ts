import { Array, Effect, Match as M, Option, Order, Schema as S } from 'effect'

import {
  type Issue,
  IssueNewestFirst,
  IssuePriority,
  IssueStatus,
} from '@foldkit/instant-tools/issues'

import { AllWork, LandingFilter, issuesForLandingFilter } from './landing.js'
import {
  AllProducts,
  ProductFilter,
  issuesForProductFilter,
} from './leftover.js'

// MODEL

/** Every claimant, or none in particular. */
export const AnyClaimant = S.TaggedStruct('AnyClaimant', {})
/** Only the Issues no one has claimed. */
export const Unclaimed = S.TaggedStruct('Unclaimed', {})
/** Only one claimant's Issues: `claude-code/issue-wip-1374`. */
export const OneClaimant = S.TaggedStruct('OneClaimant', {
  claimantId: S.String,
})
/** Which claimant's Issues a view shows. */
export const ClaimantFilter = S.Union([AnyClaimant, Unclaimed, OneClaimant])
/** Which claimant's Issues a view shows. */
export type ClaimantFilter = typeof ClaimantFilter.Type

/** The order of a view's rows: newest filed, last updated, most urgent, lowest number. */
export const IssueSort = S.Literals([
  'Created',
  'Updated',
  'Priority',
  'Number',
])
/** The order of a view's rows. */
export type IssueSort = typeof IssueSort.Type

/** The field a view's rows are grouped under, with a count in each heading. */
export const IssueGrouping = S.Literals([
  'None',
  'Status',
  'Priority',
  'Product',
  'Claimant',
])
/** The field a view's rows are grouped under. */
export type IssueGrouping = typeof IssueGrouping.Type

/** Whether a view shows rows, or a board with a column per status. */
export const IssueLayout = S.Literals(['List', 'Board'])
/** Whether a view shows rows or a board. */
export type IssueLayout = typeof IssueLayout.Type

/**
 * What the list shows, all of it in the list's URL, so a view is a link:
 * `{ query: 'heart rate', statuses: ['Open'] }` is
 * `/issues?q=heart+rate&status=Open`. `query` is what was typed into the
 * search field, `''` before anything is typed. A field left out is no filter.
 */
export const IssueView = S.Struct({
  query: S.String.pipe(
    S.withDecodingDefaultKey(Effect.succeed('')),
    S.withConstructorDefault(Effect.succeed('')),
  ),
  product: ProductFilter.pipe(
    S.withConstructorDefault(Effect.succeed(AllProducts.make({}))),
  ),
  landing: LandingFilter.pipe(
    S.withConstructorDefault(Effect.succeed(AllWork.make({}))),
  ),
  statuses: S.Array(IssueStatus).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  priorities: S.Array(IssuePriority).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  claimant: ClaimantFilter.pipe(
    S.withConstructorDefault(Effect.succeed(AnyClaimant.make({}))),
  ),
  sort: IssueSort.pipe(
    S.withDecodingDefaultKey(Effect.succeed('Created' as const)),
    S.withConstructorDefault(Effect.succeed('Created' as const)),
  ),
  grouping: IssueGrouping.pipe(
    S.withDecodingDefaultKey(Effect.succeed('None' as const)),
    S.withConstructorDefault(Effect.succeed('None' as const)),
  ),
  layout: IssueLayout.pipe(
    S.withDecodingDefaultKey(Effect.succeed('List' as const)),
    S.withConstructorDefault(Effect.succeed('List' as const)),
  ),
})
/** What the list shows, all of it in the list's URL. */
export type IssueView = typeof IssueView.Type

/** The whole list, newest first, before any search or filter: `/issues`. */
export const defaultIssueView: IssueView = IssueView.make({})

// SEARCH

const WHITESPACE = /\s+/
const NUMBER_WORD = /^#?\d+$/
const LEADING_ZEROS = /^0+(?=\d)/

/**
 * The words a search holds, lowercase, in the order typed:
 * `'  Heart  RATE '` holds `heart` and `rate`.
 */
export const searchWordsOf = (query: string): ReadonlyArray<string> => {
  const trimmed = query.trim().toLowerCase()
  return trimmed === '' ? [] : trimmed.split(WHITESPACE)
}

type SearchText = Readonly<{ title: string; head: string; body: string }>

const searchTextByIssue = new WeakMap<Issue, SearchText>()

const LINE_BREAK = '\n'

const headWordsOf = (issue: Issue): ReadonlyArray<string> => [
  issue.title,
  ...Option.toArray(issue.area),
  ...Option.toArray(issue.claimantId),
  ...Option.toArray(
    Option.map(issue.agentPresence, presence => presence.agentId),
  ),
  issue.product.name,
  issue.product.id,
  ...Option.toArray(issue.issueType),
]

const bodyWordsOf = (issue: Issue): ReadonlyArray<string> => [
  issue.details,
  ...Array.flatMap(issue.mentions, mention => [
    ...Option.toArray(mention.directQuote),
    ...Option.toArray(mention.note),
  ]),
  ...Array.flatMap(issue.workLog, entry => [
    entry.summary,
    ...Option.toArray(entry.commitSha),
  ]),
  ...Array.map(issue.successCriteria, criterion => criterion.outcome),
  ...Array.map(issue.subtasks, subtask => subtask.title),
  ...Option.match(issue.workInProgress, {
    onNone: () => [],
    onSome: work => [
      ...Option.toArray(work.branch),
      ...Option.toArray(work.commitSha),
      ...Option.toArray(work.lastStep),
    ],
  }),
]

/**
 * The words of an Issue a search reads, lowercase. `head` is what a row
 * shows of it: its title, area, claimant, the agent on it, its product and
 * its kind. `body` is everything else it says: its details, the words and
 * notes of its mentions, its work log with its commits, its success
 * criteria, its subtasks, and where its work is. Read once per Issue object,
 * which an unchanged Issue keeps across live changes.
 */
const searchTextOf = (issue: Issue): SearchText =>
  Option.getOrElse(Option.fromUndefinedOr(searchTextByIssue.get(issue)), () => {
    const text = {
      title: issue.title.toLowerCase(),
      head: Array.join(headWordsOf(issue), LINE_BREAK).toLowerCase(),
      body: Array.join(bodyWordsOf(issue), LINE_BREAK).toLowerCase(),
    }
    searchTextByIssue.set(issue, text)
    return text
  })

/**
 * Reads the search text of every Issue ahead of the first key: about 30 ms
 * for the 12.6 MB of the real catalog, once, when the search gains the focus.
 */
export const primedSearchText = (issues: ReadonlyArray<Issue>): void => {
  Array.forEach(issues, searchTextOf)
}

const withoutLeadingZeros = (digits: string): string =>
  digits.replace(LEADING_ZEROS, '')

const isNumberWord = (word: string): boolean => NUMBER_WORD.test(word)

const isMarkedNumber = (word: string): boolean => word.startsWith('#')

const digitsOf = (word: string): string =>
  withoutLeadingZeros(isMarkedNumber(word) ? word.slice(1) : word)

const hasNumberStartingWith = (issue: Issue, word: string): boolean =>
  isNumberWord(word) && withoutLeadingZeros(issue.id).startsWith(digitsOf(word))

const isInHead = (issue: Issue, word: string): boolean =>
  hasNumberStartingWith(issue, word) ||
  (!(isNumberWord(word) && isMarkedNumber(word)) &&
    searchTextOf(issue).head.includes(word))

const isInBody = (issue: Issue, word: string): boolean =>
  !(isNumberWord(word) && isMarkedNumber(word)) &&
  searchTextOf(issue).body.includes(word)

/**
 * Whether one search word finds an Issue. A number finds the Issues whose
 * number starts with it, leading zeros aside, so `92`, `092` and `#92`
 * find #092 and `#15` finds #1538; without `#`, a number anywhere in the
 * Issue also finds it. Any other word finds the Issues whose words hold
 * it: `heart` finds `Heartbeat`, and `cpu` finds the Issues that only say so
 * in their work log.
 */
const isFoundBy = (issue: Issue, word: string): boolean =>
  isInHead(issue, word) || isInBody(issue, word)

type SearchVerdicts = WeakMap<Issue, boolean>

type LastSearch = Readonly<{
  words: ReadonlyArray<string>
  verdicts: SearchVerdicts
  maybeRuledOutBy: Option.Option<SearchVerdicts>
}>

let lastSearch: LastSearch = {
  words: [],
  verdicts: new WeakMap(),
  maybeRuledOutBy: Option.none(),
}

const isNarrowingOf = (
  previous: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): boolean =>
  Array.isReadonlyArrayNonEmpty(previous) &&
  previous.length <= next.length &&
  Array.every(previous, (word, index) =>
    Option.exists(
      Array.get(next, index),
      nextWord =>
        nextWord.includes(word) &&
        (!isMarkedNumber(word) || isNumberWord(nextWord)),
    ),
  )

const searchFor = (words: ReadonlyArray<string>): LastSearch => {
  if (Array.join(lastSearch.words, ' ') === Array.join(words, ' ')) {
    return lastSearch
  } else {
    lastSearch = {
      words,
      verdicts: new WeakMap(),
      maybeRuledOutBy: isNarrowingOf(lastSearch.words, words)
        ? Option.some(lastSearch.verdicts)
        : Option.none(),
    }
    return lastSearch
  }
}

const isRuledOut = (search: LastSearch, issue: Issue): boolean =>
  Option.exists(
    search.maybeRuledOutBy,
    verdicts => verdicts.get(issue) === false,
  )

/**
 * Whether a search finds an Issue, read once per search and Issue object:
 * a letter typed onto a search reads only the Issues it still finds, and a
 * live change reads only the Issue that changed.
 */
const isFoundByEvery = (search: LastSearch, issue: Issue): boolean =>
  Option.getOrElse(Option.fromUndefinedOr(search.verdicts.get(issue)), () => {
    const verdict =
      !isRuledOut(search, issue) &&
      Array.every(search.words, word => isFoundBy(issue, word))
    search.verdicts.set(issue, verdict)
    return verdict
  })

const foundFirst = (
  found: ReadonlyArray<Issue>,
  isFirst: (issue: Issue) => boolean,
): ReadonlyArray<Issue> =>
  Array.appendAll(
    Array.filter(found, isFirst),
    Array.filter(found, issue => !isFirst(issue)),
  )

const headHitsFirst = (
  found: ReadonlyArray<Issue>,
  words: ReadonlyArray<string>,
): ReadonlyArray<Issue> =>
  foundFirst(found, issue => Array.every(words, word => isInHead(issue, word)))

const maybeOnlyNumberOf = (
  words: ReadonlyArray<string>,
): Option.Option<string> =>
  Array.match(words, {
    onEmpty: () => Option.none(),
    onNonEmpty: ([first, ...rest]) =>
      Array.isReadonlyArrayEmpty(rest) && isNumberWord(first)
        ? Option.some(digitsOf(first))
        : Option.none(),
  })

/**
 * The number a search is, when it is only a number: `1358`, `#092` and `92`
 * name #1358, #092 and #092. A search of words names none.
 */
export const issueNumberOfSearch = (query: string): Option.Option<string> =>
  maybeOnlyNumberOf(searchWordsOf(query))

/** Whether an Issue's number is the one a search names, leading zeros aside. */
export const isIssueNumbered = (issue: Issue, digits: string): boolean =>
  withoutLeadingZeros(issue.id) === digits

const numberedFirst = (
  found: ReadonlyArray<Issue>,
  words: ReadonlyArray<string>,
): ReadonlyArray<Issue> =>
  Option.match(maybeOnlyNumberOf(words), {
    onNone: () => found,
    onSome: digits =>
      foundFirst(found, issue => isIssueNumbered(issue, digits)),
  })

/**
 * The Issues a search finds: those every word of the query finds, the Issue
 * a number names first, then those with every word in what a row shows, then
 * the rest, each in their order. An empty query finds every Issue.
 */
export const issuesFoundBy = (
  issues: ReadonlyArray<Issue>,
  query: string,
): ReadonlyArray<Issue> => {
  const words = searchWordsOf(query)
  if (Array.isReadonlyArrayEmpty(words)) {
    return issues
  } else {
    const search = searchFor(words)
    return numberedFirst(
      headHitsFirst(
        Array.filter(issues, issue => isFoundByEvery(search, issue)),
        words,
      ),
      words,
    )
  }
}

/**
 * The Issues a palette goes to for what was typed: a number names the Issues
 * whose number starts with it, and words name the Issues whose title holds
 * every one.
 */
export const issuesNamedBy = (
  issues: ReadonlyArray<Issue>,
  query: string,
): ReadonlyArray<Issue> => {
  const words = searchWordsOf(query)
  return Array.filter(
    issues,
    issue =>
      Array.isReadonlyArrayNonEmpty(words) &&
      Array.every(
        words,
        word =>
          hasNumberStartingWith(issue, word) ||
          searchTextOf(issue).title.includes(word),
      ),
  )
}

// FILTER

const issuesWithStatuses = (
  issues: ReadonlyArray<Issue>,
  statuses: ReadonlyArray<IssueStatus>,
): ReadonlyArray<Issue> =>
  Array.isReadonlyArrayEmpty(statuses)
    ? issues
    : Array.filter(issues, issue => Array.contains(statuses, issue.status))

const issuesWithPriorities = (
  issues: ReadonlyArray<Issue>,
  priorities: ReadonlyArray<IssuePriority>,
): ReadonlyArray<Issue> =>
  Array.isReadonlyArrayEmpty(priorities)
    ? issues
    : Array.filter(issues, issue => Array.contains(priorities, issue.priority))

const issuesOfClaimant = (
  issues: ReadonlyArray<Issue>,
  filter: ClaimantFilter,
): ReadonlyArray<Issue> =>
  M.value(filter).pipe(
    M.withReturnType<ReadonlyArray<Issue>>(),
    M.tagsExhaustive({
      AnyClaimant: () => issues,
      Unclaimed: () =>
        Array.filter(issues, issue => Option.isNone(issue.claimantId)),
      OneClaimant: ({ claimantId }) =>
        Array.filter(issues, issue =>
          Option.contains(issue.claimantId, claimantId),
        ),
    }),
  )

// SORT

const NON_DIGITS = /\D/g

const numberOf = (issue: Issue): number =>
  Number(issue.id.replace(NON_DIGITS, ''))

const LastUpdatedFirst: Order.Order<Issue> = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (issue: Issue) => issue.updatedAtMs),
  IssueNewestFirst,
)

const MostUrgentFirst: Order.Order<Issue> = Order.combine(
  Order.mapInput(Order.String, (issue: Issue) => issue.priority),
  IssueNewestFirst,
)

const LowestNumberFirst: Order.Order<Issue> = Order.mapInput(
  Order.Number,
  numberOf,
)

const issuesSortedBy = (
  issues: ReadonlyArray<Issue>,
  sort: IssueSort,
): ReadonlyArray<Issue> =>
  M.value(sort).pipe(
    M.withReturnType<ReadonlyArray<Issue>>(),
    M.when('Created', () => issues),
    M.when('Updated', () => Array.sort(issues, LastUpdatedFirst)),
    M.when('Priority', () => Array.sort(issues, MostUrgentFirst)),
    M.when('Number', () => Array.sort(issues, LowestNumberFirst)),
    M.exhaustive,
  )

/**
 * The Issues a view shows before its search: those of its product, its work,
 * its statuses, priorities and claimant, in its order. The tracker gives them
 * newest first, as `issues list` prints them.
 */
export const issuesFilteredBy = (
  issues: ReadonlyArray<Issue>,
  view: IssueView,
): ReadonlyArray<Issue> =>
  issuesSortedBy(
    issuesOfClaimant(
      issuesWithPriorities(
        issuesWithStatuses(
          issuesForLandingFilter(
            issuesForProductFilter(issues, view.product),
            view.landing,
          ),
          view.statuses,
        ),
        view.priorities,
      ),
      view.claimant,
    ),
    view.sort,
  )

/** The Issues a view shows: {@link issuesFilteredBy}, then those its search finds. */
export const issuesInView = (
  issues: ReadonlyArray<Issue>,
  view: IssueView,
): ReadonlyArray<Issue> =>
  issuesFoundBy(issuesFilteredBy(issues, view), view.query)

// GROUP

/** Every status, in the order work moves through them. */
export const STATUS_WORKFLOW: ReadonlyArray<IssueStatus> = [
  'Backlog',
  'Planned',
  'Open',
  'InProgress',
  'Addressing',
  'Blocked',
  'FeedbackRequested',
  'PartiallyDone',
  'Regressed',
  'VerificationNeeded',
  'Verified',
  'Fixed',
  'Resolved',
  'Closed',
]

/** One group of a view's rows: its name, such as `Open`, and its Issues in order. */
export type IssueGroup = Readonly<{
  name: string
  issues: ReadonlyArray<Issue>
}>

const UNCLAIMED_GROUP = 'Unclaimed'

const groupsByName = (
  issues: ReadonlyArray<Issue>,
  nameOf: (issue: Issue) => string,
): Map<string, Array<Issue>> => {
  const groups = new Map<string, Array<Issue>>()
  Array.forEach(issues, issue => {
    const name = nameOf(issue)
    const group = groups.get(name)
    if (group === undefined) {
      groups.set(name, [issue])
    } else {
      group.push(issue)
    }
  })
  return groups
}

const groupsInOrder = (
  groups: Map<string, ReadonlyArray<Issue>>,
  names: ReadonlyArray<string>,
): ReadonlyArray<IssueGroup> =>
  Array.flatMap(names, name =>
    Option.match(Option.fromUndefinedOr(groups.get(name)), {
      onNone: () => [],
      onSome: issues => [{ issues, name }],
    }),
  )

const namesByWord = (
  groups: Map<string, ReadonlyArray<Issue>>,
): ReadonlyArray<string> =>
  Array.sort(Array.fromIterable(groups.keys()), Order.String)

const claimantNameOf = (issue: Issue): string =>
  Option.getOrElse(issue.claimantId, () => UNCLAIMED_GROUP)

const claimantNamesInOrder = (
  groups: Map<string, ReadonlyArray<Issue>>,
): ReadonlyArray<string> => [
  ...Array.filter(namesByWord(groups), name => name !== UNCLAIMED_GROUP),
  ...(groups.has(UNCLAIMED_GROUP) ? [UNCLAIMED_GROUP] : []),
]

/**
 * A view's rows under the field it groups by: statuses in the order work moves
 * through them, priorities P0 first, products and claimants by name with the
 * unclaimed last. A group with no Issues is left out, and each group keeps the
 * view's order. Grouped by nothing, there is no group.
 */
export const issueGroupsOf = (
  issues: ReadonlyArray<Issue>,
  grouping: IssueGrouping,
): ReadonlyArray<IssueGroup> =>
  M.value(grouping).pipe(
    M.withReturnType<ReadonlyArray<IssueGroup>>(),
    M.when('None', () => []),
    M.when('Status', () =>
      groupsInOrder(
        groupsByName(issues, issue => issue.status),
        STATUS_WORKFLOW,
      ),
    ),
    M.when('Priority', () =>
      groupsInOrder(
        groupsByName(issues, issue => issue.priority),
        IssuePriority.literals,
      ),
    ),
    M.when('Product', () => {
      const groups = groupsByName(issues, issue => issue.product.name)
      return groupsInOrder(groups, namesByWord(groups))
    }),
    M.when('Claimant', () => {
      const groups = groupsByName(issues, claimantNameOf)
      return groupsInOrder(groups, claimantNamesInOrder(groups))
    }),
    M.exhaustive,
  )

const everyColumnIn = (
  groups: Map<string, ReadonlyArray<Issue>>,
  names: ReadonlyArray<string>,
): ReadonlyArray<IssueGroup> =>
  Array.map(names, name => ({
    issues: Option.getOrElse(
      Option.fromUndefinedOr(groups.get(name)),
      () => [],
    ),
    name,
  }))

/**
 * The columns of a board, one for each name of the field a view groups by:
 * every status in the order work moves when it groups by status or by
 * nothing, every priority, or each product and claimant that holds an Issue.
 * A status or priority without Issues keeps its column, so a card can move
 * there.
 */
export const issueColumnsOf = (
  issues: ReadonlyArray<Issue>,
  grouping: IssueGrouping,
): ReadonlyArray<IssueGroup> =>
  M.value(grouping).pipe(
    M.withReturnType<ReadonlyArray<IssueGroup>>(),
    M.whenOr('None', 'Status', () =>
      everyColumnIn(
        groupsByName(issues, issue => issue.status),
        STATUS_WORKFLOW,
      ),
    ),
    M.when('Priority', () =>
      everyColumnIn(
        groupsByName(issues, issue => issue.priority),
        IssuePriority.literals,
      ),
    ),
    M.orElse(() => issueGroupsOf(issues, grouping)),
  )

// LISTING

const LISTINGS_KEPT_PER_SNAPSHOT = 8

/**
 * A memo over one snapshot of the Issues, read once per snapshot and key: the
 * screen, the keys and the interactions of one keystroke ask for the same
 * listing, and a live change brings a new snapshot. The newest 8 keys of a
 * snapshot are kept.
 */
export const snapshotMemo = <Value>(): ((
  issues: ReadonlyArray<Issue>,
  key: string,
  compute: () => Value,
) => Value) => {
  const bySnapshot = new WeakMap<ReadonlyArray<Issue>, Map<string, Value>>()
  return (issues, key, compute) => {
    const values = Option.getOrElse(
      Option.fromUndefinedOr(bySnapshot.get(issues)),
      () => {
        const fresh = new Map<string, Value>()
        bySnapshot.set(issues, fresh)
        return fresh
      },
    )
    return Option.getOrElse(Option.fromUndefinedOr(values.get(key)), () => {
      const computed = compute()
      const maybeOldest = Array.head(Array.fromIterable(values.keys()))
      if (
        values.size >= LISTINGS_KEPT_PER_SNAPSHOT &&
        Option.isSome(maybeOldest)
      ) {
        values.delete(maybeOldest.value)
      }
      values.set(key, computed)
      return computed
    })
  }
}

const KEY_SEPARATOR = '\u0000'

const productKeyOf = (filter: ProductFilter): string =>
  filter._tag === 'OneProduct' ? filter.productId : ''

const claimantKeyOf = (filter: ClaimantFilter): string =>
  filter._tag === 'OneClaimant' ? filter.claimantId : filter._tag

/** The key of a view's rows, for {@link snapshotMemo}. */
export const listingKeyOf = (view: IssueView): string =>
  Array.join(
    [
      view.query,
      productKeyOf(view.product),
      view.landing._tag,
      Array.join(view.statuses, ','),
      Array.join(view.priorities, ','),
      claimantKeyOf(view.claimant),
      view.sort,
    ],
    KEY_SEPARATOR,
  )
