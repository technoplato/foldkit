import { Array, Option, Schema as S } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

// MODEL

/**
 * What the list shows, all of it in the list's URL, so a view is a link:
 * `{ query: 'heart rate' }` is `/issues?q=heart+rate`. `query` is what was
 * typed into the search field, `''` before anything is typed.
 */
export const IssueView = S.Struct({ query: S.String })
/** What the list shows, all of it in the list's URL. */
export type IssueView = typeof IssueView.Type

/** The whole list, newest first, before any search: `/issues`. */
export const defaultIssueView: IssueView = IssueView.make({ query: '' })

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

// LISTING

const LISTINGS_KEPT_PER_SNAPSHOT = 8

const listingsBySnapshot = new WeakMap<
  ReadonlyArray<Issue>,
  Map<string, ReadonlyArray<Issue>>
>()

/**
 * A listing of one snapshot of the Issues, read once per snapshot and key:
 * the screen, the keys and the interactions of one keystroke ask for the
 * same listing, and a live change brings a new snapshot. The newest 8 keys
 * of a snapshot are kept.
 */
export const listingOf = (
  issues: ReadonlyArray<Issue>,
  key: string,
  list: () => ReadonlyArray<Issue>,
): ReadonlyArray<Issue> => {
  const listings = Option.getOrElse(
    Option.fromUndefinedOr(listingsBySnapshot.get(issues)),
    () => {
      const fresh = new Map<string, ReadonlyArray<Issue>>()
      listingsBySnapshot.set(issues, fresh)
      return fresh
    },
  )
  return Option.getOrElse(Option.fromUndefinedOr(listings.get(key)), () => {
    const listed = list()
    const maybeOldest = Array.head(Array.fromIterable(listings.keys()))
    if (
      listings.size >= LISTINGS_KEPT_PER_SNAPSHOT &&
      Option.isSome(maybeOldest)
    ) {
      listings.delete(maybeOldest.value)
    }
    listings.set(key, listed)
    return listed
  })
}
