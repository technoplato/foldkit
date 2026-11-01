import { Array, Option, Order, pipe } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type Interaction, interaction, uniqueByToken } from './interaction.js'
import { issuesNamedBy } from './issueView.js'
import { keyInteractionsOf, placeInteractions } from './keys.js'
import { loadedIssuesIn } from './listing.js'
import { type Model } from './model.js'
import { interactionsForModel } from './presentation.js'
import { selectIssueMessageOf } from './selection.js'

// NAME

const LEFT_OUT_TOKENS: ReadonlyArray<string> = [
  'backlog',
  'comment-submit',
  'cursor:next',
  'cursor:previous',
  'go',
  'go:cancel',
  'layer-dismiss',
  'link-submit',
  'palette',
  'palette-down',
  'palette-submit',
  'palette-up',
  'search-blur',
  'triage',
]

const isListed = (candidate: Interaction): boolean =>
  !Array.contains(LEFT_OUT_TOKENS, candidate.token) &&
  !candidate.token.startsWith('open:') &&
  !candidate.token.startsWith('menu:')

const NAME_PREFIX_OF_TOKEN: ReadonlyArray<readonly [string, string]> = [
  ['product:', 'Product'],
  ['landing:', 'Work'],
  ['filter-status:', 'Filter status'],
  ['filter-priority:', 'Filter priority'],
  ['filter-claimant:', 'Filter claimant'],
  ['sort:', 'Sort'],
  ['group:', 'Group'],
  ['view:', 'View'],
]

const paletteLabelOf = (candidate: Interaction): string =>
  Option.match(
    Array.findFirst(NAME_PREFIX_OF_TOKEN, ([tokenPrefix]) =>
      candidate.token.startsWith(tokenPrefix),
    ),
    {
      onNone: () => candidate.label,
      onSome: ([, namePrefix]) => `${namePrefix}: ${candidate.label}`,
    },
  )

const namedActions = new WeakMap<Interaction, Interaction>()

const namedAction = (candidate: Interaction): Interaction =>
  Option.getOrElse(Option.fromUndefinedOr(namedActions.get(candidate)), () => {
    const named = { ...candidate, label: paletteLabelOf(candidate) }
    namedActions.set(candidate, named)
    return named
  })

/**
 * Every action and place the Program offers now, by the name a palette shows:
 * the places first, then what the keyboard and the page offer, each token
 * once, with no row for opening each Issue, which a typed word or number
 * brings up.
 */
export const paletteActionsOf = (model: Model): ReadonlyArray<Interaction> =>
  pipe(
    [
      ...placeInteractions,
      ...keyInteractionsOf(model),
      ...interactionsForModel(model),
    ],
    Array.filter(isListed),
    uniqueByToken,
    Array.map(namedAction),
  )

// MATCH

const WORD_START = /[\s:/#-]/

const isAtWordStart = (name: string, query: string): boolean =>
  name
    .split(WORD_START)
    .some(word => word.startsWith(query.replace(WORD_START, '')))

const STARTS_WITH_RANK = 0
const WORD_START_RANK = 1
const CONTAINS_RANK = 2
const SCATTERED_RANK = 3

const scatteredGapsOf = (
  name: string,
  letters: ReadonlyArray<string>,
): Option.Option<number> => {
  let position = 0
  let gaps = 0
  for (const letter of letters) {
    const found = name.indexOf(letter, position)
    if (found < 0) {
      return Option.none()
    }
    gaps += found - position
    position = found + 1
  }
  return Option.some(gaps)
}

/**
 * How closely a name matches what was typed, lowest first: the name starts
 * with it, a word in it does, it holds it, or it holds its letters in order
 * with the fewest gaps. `bklg` finds `Go to backlog`, and `zq` finds nothing.
 */
const rankOf = (name: string, query: string): Option.Option<number> => {
  if (name.startsWith(query)) {
    return Option.some(STARTS_WITH_RANK)
  } else if (isAtWordStart(name, query)) {
    return Option.some(WORD_START_RANK)
  } else if (name.includes(query)) {
    return Option.some(CONTAINS_RANK)
  } else {
    return Option.map(
      scatteredGapsOf(name, Array.fromIterable(query.replaceAll(' ', ''))),
      gaps => SCATTERED_RANK + gaps,
    )
  }
}

type RankedAction = Readonly<{ action: Interaction; rank: number }>

const byRank = Order.mapInput(
  Order.Number,
  (ranked: RankedAction) => ranked.rank,
)

/** The actions whose names match what was typed, closest first. */
export const matchedByName = (
  actions: ReadonlyArray<Interaction>,
  query: string,
): ReadonlyArray<Interaction> => {
  const wanted = query.trim().toLowerCase()
  return pipe(
    actions,
    Array.flatMap(action =>
      Option.match(rankOf(action.label.toLowerCase(), wanted), {
        onNone: () => [],
        onSome: rank => [{ action, rank }],
      }),
    ),
    Array.sort(byRank),
    Array.map(ranked => ranked.action),
  )
}

const goToIssueByIssue = new WeakMap<Issue, Interaction>()

const goToIssueOf = (issue: Issue): Interaction =>
  Option.getOrElse(Option.fromUndefinedOr(goToIssueByIssue.get(issue)), () => {
    const going = interaction(
      `open:${issue.id}`,
      `Go to Issue ${issue.id}: ${issue.title}`,
      selectIssueMessageOf(issue.id),
    )
    goToIssueByIssue.set(issue, going)
    return going
  })

const STARTS_WITH_DIGIT = /^#?\d/

/**
 * The rows of the palette for what is typed: every action and place, closest
 * first, and the Issue a number names or whose titles hold the words. Issues
 * come first for a number and after the actions for words. Nothing typed
 * lists every action and place.
 */
export const paletteRowsOf = (
  model: Model,
  query: string,
): ReadonlyArray<Interaction> => {
  if (query.trim() === '') {
    return paletteActionsOf(model)
  } else {
    const actions = matchedByName(paletteActionsOf(model), query)
    const issues = Array.map(
      issuesNamedBy(loadedIssuesIn(model), query),
      goToIssueOf,
    )
    return STARTS_WITH_DIGIT.test(query.trim())
      ? Array.appendAll(issues, actions)
      : Array.appendAll(actions, issues)
  }
}
