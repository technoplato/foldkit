import {
  Array,
  Data,
  Match as M,
  Option,
  Order,
  Predicate,
  Result,
  Schema as S,
  String,
  pipe,
} from 'effect'

import { type CatalogCarrierOf, type Entry } from '../catalog/catalog.js'
import { mapMessages } from '../command/index.js'
import {
  type KeyInput,
  type MenuHint,
  type MenuRow,
  type MenuView,
  type ProgramInteraction,
  type TextRun,
  isChord,
  isKey,
  keyInput,
  normalizeKey,
} from '../interaction/interaction.js'
import {
  type DestinationOf,
  composeNavigation,
  composedDestination,
  composedFields,
  fieldLens,
  holdOf,
  ownedMessages,
  schemaMembersOf,
} from '../navigation/compose.js'
import {
  type NotFound,
  menuView as menuEntryView,
  presentRoute,
} from '../navigation/declaration.js'
import * as NavigationMessage from '../navigation/message.js'
import {
  Dialog,
  NavigationStack,
  type PresentationStyle,
  entriesOf,
  popped,
  presented,
  pushed,
  stackAtRoot,
  topEntry,
  truncated,
} from '../navigation/structure.js'
import { backMessages, foldMessage } from '../navigation/transition.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramSchema,
} from '../program/program.js'
import { make } from '../program/program.js'
import * as Route from '../route/parser.js'
import { m, ts } from '../schema/index.js'

// FOCUS

/**
 * The filter has the keyboard. `maybeHighlighted` is the Action Enter sends,
 * none when the query matches nothing.
 */
export const OnFilter = ts('OnFilter', { maybeHighlighted: S.Option(S.String) })
/** The filter has the keyboard. */
export type OnFilter = typeof OnFilter.Type

/** A catalog Action has the keyboard and is the highlighted row. */
export const OnAction = ts('OnAction', { tag: S.String })
/** A catalog Action has the keyboard and is the highlighted row. */
export type OnAction = typeof OnAction.Type

/**
 * What has the keyboard while the menu is presented: the filter or one
 * catalog Action, never a Model field (Q110, Q111).
 */
export const Focus = S.Union([OnFilter, OnAction])
/** What has the keyboard while the menu is presented. */
export type Focus = typeof Focus.Type

// DESTINATION

/**
 * The presented action menu, carried as a navigation destination the way
 * Swift Navigation carries a presented feature's state.
 *
 * @example
 * ```typescript
 * ActionMenu({
 *   query: 're',
 *   focus: OnFilter({ maybeHighlighted: Option.some('Reset') }),
 * })
 * ```
 */
export const ActionMenu = ts('ActionMenu', { query: S.String, focus: Focus })
/** The presented action menu. */
export type ActionMenu = typeof ActionMenu.Type

const isActionMenu = S.is(ActionMenu)

const asMenu = (destination: unknown): Option.Option<ActionMenu> =>
  isActionMenu(destination) ? Option.some(destination) : Option.none()

// MESSAGE

/**
 * A person opened the action menu with Cmd-K, `?`, or its button. A stack
 * holds one menu: if a page was pushed above an open menu, opening it
 * again returns to that menu.
 */
export const OpenedActionMenu = m('OpenedActionMenu')
/** A person dismissed the action menu with Escape or by clicking outside it. */
export const DismissedActionMenu = m('DismissedActionMenu')
/** A person typed into the action menu filter. */
export const ChangedActionMenuQuery = m('ChangedActionMenuQuery', {
  query: S.String,
})

/** Where one focus movement goes. */
export const FocusMove = S.Literals([
  'Next',
  'Previous',
  'First',
  'Last',
  'Filter',
])
/** Where one focus movement goes. */
export type FocusMove = typeof FocusMove.Type

/** A person moved focus with arrows, Tab, j and k, or Escape from a row. */
export const MovedActionMenuFocus = m('MovedActionMenuFocus', {
  move: FocusMove,
})
/**
 * A person chose a row, which closes the menu. It is sent before the chosen
 * Action, so an Action that moves the stack, such as opening the Session
 * settings, lands on the entry beneath the menu. The chosen Action is sent
 * as its own Message, so the tape records `Increment`, not a wrapper.
 */
export const ChoseActionMenuAction = m('ChoseActionMenuAction', {
  tag: S.String,
})

/** Every action menu Message. All of them are Navigation. */
export const Message = S.Union([
  OpenedActionMenu,
  DismissedActionMenu,
  ChangedActionMenuQuery,
  MovedActionMenuFocus,
  ChoseActionMenuAction,
])
/** Every action menu Message. */
export type Message = typeof Message.Type

/** True when a Message belongs to the action menu. */
export const isMessage = S.is(Message)

// FILTER

const PrefixMatch = 0
const WordMatch = 1
const LooseMatch = 2
const DescriptionMatch = 3

type Match = Readonly<{
  rank: number
  titlePositions: ReadonlyArray<number>
  descriptionPositions: ReadonlyArray<number>
}>

/**
 * One Catalog row a query kept: the entry, and its title and description
 * with the matched letters marked.
 */
export type MatchedEntry = Readonly<{
  entry: Entry
  title: ReadonlyArray<TextRun>
  description: ReadonlyArray<TextRun>
}>

const isAcronym = (word: string): boolean =>
  word.length > 1 && word === word.toUpperCase()

/**
 * An Action's tag as words, the title a menu row shows.
 *
 * @example
 * ```typescript
 * titleOf('OpenSessionSettings') // 'Open session settings'
 * titleOf('OpenURL') // 'Open URL'
 * ```
 */
export const titleOf = (tag: string): string =>
  pipe(
    tag,
    String.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
    String.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'),
    String.split(' '),
    Array.map((word, index) =>
      index === 0 || isAcronym(word) ? word : word.toLowerCase(),
    ),
    Array.join(' '),
  )

const substringPositions = (
  haystack: string,
  needle: string,
): Option.Option<ReadonlyArray<number>> =>
  Option.map(String.indexOf(needle)(haystack.toLowerCase()), start =>
    Array.range(start, start + needle.length - 1),
  )

const prefixPositions = (
  haystack: string,
  needle: string,
): Option.Option<ReadonlyArray<number>> =>
  Option.filter(substringPositions(haystack, needle), positions =>
    Option.contains(Array.head(positions), 0),
  )

const subsequencePositions = (
  haystack: string,
  needle: string,
): Option.Option<ReadonlyArray<number>> => {
  const letters = String.replaceAll(' ', '')(needle)
  const positions = Array.reduce(
    String.split(haystack.toLowerCase(), ''),
    Array.empty<number>(),
    (matched, character, index) =>
      matched.length < letters.length &&
      letters.charAt(matched.length) === character
        ? Array.append(matched, index)
        : matched,
  )
  return positions.length === letters.length && letters.length > 0
    ? Option.some(positions)
    : Option.none()
}

const inTitle =
  (rank: number) =>
  (titlePositions: ReadonlyArray<number>): Match => ({
    rank,
    titlePositions,
    descriptionPositions: [],
  })

const unmarked = (rank: number): Match => inTitle(rank)([])

const matchOf = (entry: Entry, needle: string): Option.Option<Match> => {
  const title = titleOf(entry.tag)
  return pipe(
    Option.map(prefixPositions(title, needle), inTitle(PrefixMatch)),
    Option.orElse(() =>
      Option.map(
        Option.orElse(prefixPositions(entry.tag, needle), () =>
          prefixPositions(entry.label, needle),
        ),
        () => unmarked(PrefixMatch),
      ),
    ),
    Option.orElse(() =>
      Option.map(substringPositions(title, needle), inTitle(WordMatch)),
    ),
    Option.orElse(() =>
      Option.map(substringPositions(entry.label, needle), () =>
        unmarked(WordMatch),
      ),
    ),
    Option.orElse(() =>
      Option.map(subsequencePositions(title, needle), inTitle(LooseMatch)),
    ),
    Option.orElse(() =>
      Option.map(
        substringPositions(entry.what, needle),
        (descriptionPositions): Match => ({
          rank: DescriptionMatch,
          titlePositions: [],
          descriptionPositions,
        }),
      ),
    ),
  )
}

const runsOf = (
  text: string,
  positions: ReadonlyArray<number>,
): ReadonlyArray<TextRun> =>
  String.isEmpty(text)
    ? []
    : Array.reduce(
        String.split(text, ''),
        Array.empty<TextRun>(),
        (runs, character, index) => {
          const isMatch = Array.contains(positions, index)
          return Option.match(Array.last(runs), {
            onNone: () => [{ text: character, isMatch }],
            onSome: last =>
              last.isMatch === isMatch
                ? Array.append(Array.dropRight(runs, 1), {
                    text: `${last.text}${character}`,
                    isMatch,
                  })
                : Array.append(runs, { text: character, isMatch }),
          })
        },
      )

const matchedEntryOf = (entry: Entry, match: Match): MatchedEntry => ({
  entry,
  title: runsOf(titleOf(entry.tag), match.titlePositions),
  description: runsOf(entry.what, match.descriptionPositions),
})

/**
 * The rows a query keeps, with the matched letters marked. An empty query
 * keeps every row in Catalog order. Otherwise rows rank by how they match,
 * then by Catalog order: a title, tag, or label prefix first, then a
 * substring of the title or label, then the query's letters in order
 * through the title, then a substring of `what`. `re` puts Reset first and
 * marks `Re`; `rs` puts Reset first and marks `R` and `s`, above a row
 * whose `what` happens to contain `first`.
 */
export const matchedEntries = (
  catalogEntries: ReadonlyArray<Entry>,
  query: string,
): ReadonlyArray<MatchedEntry> => {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return Array.map(catalogEntries, entry =>
      matchedEntryOf(entry, unmarked(PrefixMatch)),
    )
  }
  return pipe(
    catalogEntries,
    Array.filterMap((entry, index) =>
      Option.match(matchOf(entry, needle), {
        onNone: () => Result.failVoid,
        onSome: match => Result.succeed({ entry, match, index }),
      }),
    ),
    Array.sort(
      Order.combine(
        Order.mapInput(
          Order.Number,
          (ranked: RankedEntry) => ranked.match.rank,
        ),
        Order.mapInput(Order.Number, (ranked: RankedEntry) => ranked.index),
      ),
    ),
    Array.map(ranked => matchedEntryOf(ranked.entry, ranked.match)),
  )
}

/** The entries a query keeps, ranked as {@link matchedEntries} ranks them. */
export const visibleEntries = (
  catalogEntries: ReadonlyArray<Entry>,
  query: string,
): ReadonlyArray<Entry> =>
  Array.map(matchedEntries(catalogEntries, query), matched => matched.entry)

type RankedEntry = Readonly<{ entry: Entry; match: Match; index: number }>

const tagsOf = (visible: ReadonlyArray<Entry>): ReadonlyArray<string> =>
  Array.map(visible, entry => entry.tag)

const firstTag = (visible: ReadonlyArray<Entry>): Option.Option<string> =>
  Array.head(tagsOf(visible))

const lastTag = (visible: ReadonlyArray<Entry>): Option.Option<string> =>
  Array.last(tagsOf(visible))

const isVisible = (visible: ReadonlyArray<Entry>, tag: string): boolean =>
  Array.contains(tagsOf(visible), tag)

const neighborTag = (
  visible: ReadonlyArray<Entry>,
  tag: string,
  offset: number,
): Option.Option<string> =>
  pipe(
    Array.findFirstIndex(tagsOf(visible), candidate => candidate === tag),
    Option.flatMap(index => Array.get(tagsOf(visible), index + offset)),
  )

const highlightedTag = (focus: Focus): Option.Option<string> =>
  M.value(focus).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      OnFilter: ({ maybeHighlighted }) => maybeHighlighted,
      OnAction: ({ tag }) => Option.some(tag),
    }),
  )

// TRANSITION

/** The menu as it opens: empty query, filter focused, first row highlighted. */
export const opened = (visible: ReadonlyArray<Entry>): ActionMenu =>
  ActionMenu({
    query: '',
    focus: OnFilter({ maybeHighlighted: firstTag(visible) }),
  })

/**
 * The menu after its query changes. While the filter has focus, the best
 * match is highlighted, so Enter sends what the person is typing toward. A
 * row the person moved focus onto keeps it while the row still matches.
 */
export const withQuery = (
  menu: ActionMenu,
  query: string,
  visibleAfter: ReadonlyArray<Entry>,
): ActionMenu => {
  const bestMatch = OnFilter({ maybeHighlighted: firstTag(visibleAfter) })
  const focus = M.value(menu.focus).pipe(
    M.withReturnType<Focus>(),
    M.tagsExhaustive({
      OnFilter: () => bestMatch,
      OnAction: ({ tag }) =>
        isVisible(visibleAfter, tag) ? OnAction({ tag }) : bestMatch,
    }),
  )
  return ActionMenu({ query, focus })
}

const focusOnAction = (
  maybeTag: Option.Option<string>,
  fallback: Focus,
): Focus =>
  Option.match(maybeTag, {
    onNone: () => fallback,
    onSome: tag => OnAction({ tag }),
  })

const movedFromFilter = (
  focus: OnFilter,
  move: FocusMove,
  visible: ReadonlyArray<Entry>,
): Focus =>
  M.value(move).pipe(
    M.withReturnType<Focus>(),
    M.when('Next', () =>
      focusOnAction(
        Option.orElse(focus.maybeHighlighted, () => firstTag(visible)),
        focus,
      ),
    ),
    M.when('Previous', () => focus),
    M.when('First', () => focusOnAction(firstTag(visible), focus)),
    M.when('Last', () => focusOnAction(lastTag(visible), focus)),
    M.when('Filter', () => focus),
    M.exhaustive,
  )

const movedFromAction = (
  focus: OnAction,
  move: FocusMove,
  visible: ReadonlyArray<Entry>,
): Focus =>
  M.value(move).pipe(
    M.withReturnType<Focus>(),
    M.when('Next', () =>
      focusOnAction(neighborTag(visible, focus.tag, 1), focus),
    ),
    M.when('Previous', () =>
      focusOnAction(
        neighborTag(visible, focus.tag, -1),
        OnFilter({ maybeHighlighted: Option.some(focus.tag) }),
      ),
    ),
    M.when('First', () => focusOnAction(firstTag(visible), focus)),
    M.when('Last', () => focusOnAction(lastTag(visible), focus)),
    M.when('Filter', () =>
      OnFilter({ maybeHighlighted: Option.some(focus.tag) }),
    ),
    M.exhaustive,
  )

/**
 * The menu after one focus movement. Down from the filter enters the list;
 * Up from the first row returns to the filter; Down on the last row stays.
 */
export const moved = (
  menu: ActionMenu,
  move: FocusMove,
  visible: ReadonlyArray<Entry>,
): ActionMenu =>
  ActionMenu({
    query: menu.query,
    focus: M.value(menu.focus).pipe(
      M.withReturnType<Focus>(),
      M.tagsExhaustive({
        OnFilter: focus => movedFromFilter(focus, move, visible),
        OnAction: focus => movedFromAction(focus, move, visible),
      }),
    ),
  })

// VIEW

const menuTitle = 'Actions'

const menuFilterLabel = 'Search actions'

const summaryOf = (query: string, rows: ReadonlyArray<MenuRow>): string =>
  Array.match(rows, {
    onEmpty: () =>
      String.isEmpty(query.trim())
        ? 'No actions'
        : `No actions match “${query.trim()}”`,
    onNonEmpty: nonEmpty =>
      nonEmpty.length === 1 ? '1 action' : `${nonEmpty.length} actions`,
  })

const hintsOf = (focus: Focus): ReadonlyArray<MenuHint> => [
  { keys: ['↑', '↓'], does: 'move' },
  { keys: ['↵'], does: 'run' },
  {
    keys: ['esc'],
    does: focus._tag === 'OnFilter' ? 'close' : 'back to search',
  },
]

const rowOf =
  (focus: Focus) =>
  (matched: MatchedEntry): MenuRow => ({
    entry: matched.entry,
    title: matched.title,
    description: matched.description,
    keys: Array.take(matched.entry.keys, 1),
    isHighlighted: Option.contains(highlightedTag(focus), matched.entry.tag),
    isFocused: focus._tag === 'OnAction' && focus.tag === matched.entry.tag,
  })

/**
 * The menu as every Client paints it: the Catalog ranked by the query
 * with matched letters marked, the highlighted and focused rows, a
 * summary for a screen reader, and the keys that work right now.
 *
 * @example
 * ```typescript
 * menuViewOf(entries, ActionMenu({ query: 're', focus }), Dialog())
 * // { title: 'Actions', query: 're', summary: '1 action',
 * //   rows: [{ title: [{ text: 'Re', isMatch: true }, { text: 'set', isMatch: false }], ... }],
 * //   hints: [{ keys: ['↑', '↓'], does: 'move' }, ...], ... }
 * ```
 */
export const menuViewOf = (
  catalogEntries: ReadonlyArray<Entry>,
  menu: ActionMenu,
  style: PresentationStyle,
): MenuView => {
  const rows = Array.map(
    matchedEntries(catalogEntries, menu.query),
    rowOf(menu.focus),
  )
  return {
    title: menuTitle,
    filterLabel: menuFilterLabel,
    query: menu.query,
    isFilterFocused: menu.focus._tag === 'OnFilter',
    rows,
    summary: summaryOf(menu.query, rows),
    hints: hintsOf(menu.focus),
    style,
  }
}

// STACK

/** The presented action menu, when the top of the stack is the menu. */
export const menuOf = <Destination>(
  stack: NavigationStack<Destination>,
): Option.Option<ActionMenu> =>
  pipe(
    topEntry(stack),
    Option.map(entry => entry.destination),
    Option.filter(isActionMenu),
  )

const menuDepthOf = <Destination>(
  stack: NavigationStack<Destination>,
): Option.Option<number> =>
  Array.findFirstIndex(entriesOf(stack), entry =>
    isActionMenu(entry.destination),
  )

const withoutTop = <Destination>(
  stack: NavigationStack<Destination>,
): NavigationStack<Destination> => Option.getOrElse(popped(stack), () => stack)

const replaceMenu = <Destination>(
  stack: NavigationStack<Destination | ActionMenu>,
  menu: ActionMenu,
): NavigationStack<Destination | ActionMenu> =>
  Option.match(topEntry(stack), {
    onNone: () => stack,
    onSome: entry => pushed(withoutTop(stack), presented(menu, entry.style)),
  })

const dismissMenu = <Destination>(
  stack: NavigationStack<Destination>,
): NavigationStack<Destination> =>
  Option.isSome(menuOf(stack)) ? withoutTop(stack) : stack

// URI

const MenuQuery = S.Struct({ q: S.optionalKey(S.String) })
type MenuQuery = typeof MenuQuery.Type

const menuQueryOf = (query: string): MenuQuery =>
  String.isEmpty(query) ? {} : { q: query }

/**
 * The menu a URI opens: its query, and no highlight until the route
 * settles it against the Catalog.
 */
const parsedMenu = (query: string): ActionMenu =>
  ActionMenu({ query, focus: OnFilter({ maybeHighlighted: Option.none() }) })

// COMPOSE

/** A composed child's Model had a field the combinator reserves. */
export class ActionMenuReservedFieldError extends Data.TaggedError(
  'ActionMenuReservedFieldError',
)<{
  readonly field: string
  readonly programId: string
}> {}

/** A child could not be composed because it lacks a Catalog or root destination. */
export class ActionMenuChildIncompleteError extends Data.TaggedError(
  'ActionMenuChildIncompleteError',
)<{
  readonly missing: 'interaction' | 'navigation' | 'struct Model'
  readonly programId: string
}> {}

/** A child Program the action menu can wrap: it has a Catalog and a root. */
export type ActionMenuChild = Program<any, any, any, any, any>

export type { DestinationOf } from '../navigation/compose.js'

/** The Destinations of the composed Program: the child's, the menu, NotFound. */
export type ActionMenuDestinationOf<Child extends ActionMenuChild> =
  | DestinationOf<Child>
  | ActionMenu
  | NotFound

/** The composed Model: the child's fields, flat, plus the navigation stack. */
export type ActionMenuModel<Child extends ActionMenuChild> = Omit<
  ModelOf<Child>,
  'navigation'
> &
  Readonly<{
    navigation: NavigationStack<ActionMenuDestinationOf<Child>>
  }>

/**
 * The composed Message: the child's Messages unwrapped, the menu Messages,
 * and the carrier facts.
 */
export type ActionMenuMessage<Child extends ActionMenuChild> =
  | MessageOf<Child>
  | Message
  | NavigationMessage.Message

/** A Program produced by {@link compose}. */
export type ActionMenuProgram<Child extends ActionMenuChild> = Program<
  ActionMenuModel<Child>,
  ActionMenuMessage<Child> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  Readonly<{ of: Child }> &
  CatalogCarrierOf<Child>

const structFieldsOf = (
  schema: unknown,
  programId: string,
): S.Struct.Fields => {
  if (!Predicate.hasProperty(schema, 'fields')) {
    throw new ActionMenuChildIncompleteError({
      missing: 'struct Model',
      programId,
    })
  }
  return schema.fields as S.Struct.Fields
}

const menuKeys: ReadonlyArray<KeyInput> = [
  keyInput('?'),
  keyInput('k', { isMeta: true }),
  keyInput('k', { isControl: true }),
]

const isToggleChord = (input: KeyInput): boolean =>
  Array.some(menuKeys, declared => isChord(declared) && isKey(declared, input))

const isOpenChord = (input: KeyInput): boolean =>
  Array.some(menuKeys, declared => isKey(declared, input))

const isPrintable = (key: string, input: KeyInput): boolean =>
  key.length === 1 && !isChord(input)

/**
 * Wraps any Program that has a Catalog and a root destination with the one
 * global action menu. The menu is a presented destination on a navigation
 * stack whose root is the child's root, so synchronization modes decide
 * whether it mirrors across devices. The composed Model stays flat: the
 * child's fields plus `navigation`.
 *
 * @example
 * ```typescript
 * const App = ActionMenu.compose({ of: CounterProgram })
 * // App.Model: { count, navigation }
 * // App.interaction.pressKey(model, keyInput('k', { isMeta: true }))
 * //   → [OpenedActionMenu()]
 * ```
 */
export const compose = <Child extends ActionMenuChild>(config: {
  of: Child
  style?: PresentationStyle
  id?: string
  version?: number
}): ActionMenuProgram<Child> => {
  const child = config.of
  type ChildModel = ModelOf<Child>
  type ChildMessage = MessageOf<Child>
  type AppModel = ActionMenuModel<Child>
  type AppMessage = ActionMenuMessage<Child> & Readonly<{ _tag: string }>
  type AppDestination = ActionMenuDestinationOf<Child>
  type AppCommand = ProgramCommand<AppMessage, any>

  const childInteraction = child.interaction
  const childNavigation = child.navigation
  if (childInteraction === undefined) {
    throw new ActionMenuChildIncompleteError({
      missing: 'interaction',
      programId: child.id,
    })
  }
  if (childNavigation === undefined) {
    throw new ActionMenuChildIncompleteError({
      missing: 'navigation',
      programId: child.id,
    })
  }
  const hold = holdOf(childNavigation)
  const childFields = structFieldsOf(child.Model, child.id)
  if (hold === 'Owns' && Object.hasOwn(childFields, 'navigation')) {
    throw new ActionMenuReservedFieldError({
      field: 'navigation',
      programId: child.id,
    })
  }
  const style = config.style ?? Dialog()

  const Destination = composedDestination(childNavigation, [ActionMenu], hold)
  const Model = S.Struct(
    composedFields(childFields, Destination),
  ) as unknown as ProgramSchema<AppModel>
  const AppMessageSchema = S.Union([
    ...schemaMembersOf(child.Message),
    ...Message.members,
    ...ownedMessages(hold),
  ]) as unknown as ProgramSchema<AppMessage>

  const childOf = (model: AppModel): ChildModel => {
    if (hold === 'Extends') {
      return model as unknown as ChildModel
    }
    const { navigation: _navigation, ...childModel } = model
    return childModel as ChildModel
  }

  const withChild = (model: AppModel, childModel: ChildModel): AppModel =>
    (hold === 'Extends'
      ? childModel
      : { ...childModel, navigation: model.navigation }) as AppModel

  const visibleOf = (model: AppModel, query: string): ReadonlyArray<Entry> =>
    visibleEntries(childInteraction.entries(childOf(model)), query)

  const menuRoute = presentRoute(
    Route.caseOf<AppDestination, MenuQuery>(
      pipe(Route.literal('menu'), Route.query(MenuQuery)),
      {
        embed: ({ q }) => parsedMenu(q ?? ''),
        extract: destination =>
          Option.map(asMenu(destination), menu => menuQueryOf(menu.query)),
      },
    ),
    style,
    {
      isAllowedAbove: beneath => !Array.some(beneath, isActionMenu),
      title: () => 'Actions',
    },
  )

  const navigation = composeNavigation<
    AppModel,
    ChildModel,
    AppDestination,
    DestinationOf<Child>
  >({
    child: childNavigation,
    hold,
    Destination: Destination as unknown as ProgramSchema<AppDestination>,
    childOf,
    stack: fieldLens<AppModel, AppDestination>(),
    embedNotFound: notFound => notFound,
    routes: [menuRoute],
    viewOf: (model, destination) =>
      Option.map(asMenu(destination), menu =>
        menuEntryView(viewOfMenu(model, menu, style)),
      ),
    settleEntry: (model, destination) =>
      Option.match(asMenu(destination), {
        onNone: () => destination,
        onSome: (menu): AppDestination =>
          withQuery(menu, menu.query, visibleOf(model, menu.query)),
      }),
  })

  const withNavigation = (
    model: AppModel,
    navigation: AppModel['navigation'],
  ): readonly [AppModel, ReadonlyArray<AppCommand>] => [
    { ...model, navigation },
    [],
  ]

  const updateMenu = (
    model: AppModel,
    message: Message,
  ): readonly [AppModel, ReadonlyArray<AppCommand>] =>
    M.value(message).pipe(
      M.withReturnType<readonly [AppModel, ReadonlyArray<AppCommand>]>(),
      M.tagsExhaustive({
        OpenedActionMenu: () =>
          Option.match(menuDepthOf(model.navigation), {
            onNone: () =>
              withNavigation(
                model,
                pushed<AppDestination>(
                  model.navigation,
                  presented<AppDestination>(
                    opened(visibleOf(model, '')),
                    style,
                  ),
                ),
              ),
            onSome: depth =>
              Option.isSome(menuOf(model.navigation))
                ? [model, []]
                : withNavigation(model, truncated(model.navigation, depth + 1)),
          }),
        DismissedActionMenu: () =>
          withNavigation(model, dismissMenu<AppDestination>(model.navigation)),
        ChangedActionMenuQuery: ({ query }) =>
          Option.match(menuOf(model.navigation), {
            onNone: () => [model, []],
            onSome: menu =>
              withNavigation(
                model,
                replaceMenu<AppDestination>(
                  model.navigation,
                  withQuery(menu, query, visibleOf(model, query)),
                ),
              ),
          }),
        MovedActionMenuFocus: ({ move }) =>
          Option.match(menuOf(model.navigation), {
            onNone: () => [model, []],
            onSome: menu =>
              withNavigation(
                model,
                replaceMenu<AppDestination>(
                  model.navigation,
                  moved(menu, move, visibleOf(model, menu.query)),
                ),
              ),
          }),
        ChoseActionMenuAction: () =>
          withNavigation(model, dismissMenu<AppDestination>(model.navigation)),
      }),
    )

  const init = (): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    const [childModel, commands] = child.init()
    return [
      (hold === 'Extends'
        ? childModel
        : {
            ...childModel,
            navigation: stackAtRoot<AppDestination>(childNavigation.root),
          }) as AppModel,
      commands as ReadonlyArray<AppCommand>,
    ]
  }

  const restore = (
    model: AppModel,
  ): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    if (child.restore === undefined) {
      return [model, []]
    }
    const [childModel, commands] = child.restore(childOf(model))
    return [withChild(model, childModel), commands as ReadonlyArray<AppCommand>]
  }

  const update = (
    model: AppModel,
    message: AppMessage,
  ): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    if (NavigationMessage.isMessage(message)) {
      return [foldMessage(navigation, model, message), []]
    }
    if (isMessage(message)) {
      return updateMenu(model, message)
    }
    const [childModel, commands] = child.update(
      childOf(model),
      message as ChildMessage,
    )
    return [
      withChild(model, childModel),
      mapMessages(commands, commandMessage => commandMessage as AppMessage),
    ]
  }

  const isOpen = (model: AppModel): boolean =>
    Option.isSome(menuOf(model.navigation))

  const choose = (model: AppModel, tag: string): ReadonlyArray<AppMessage> => {
    if (!isOpen(model)) {
      return []
    }
    return Array.match(childInteraction.press(childOf(model), tag), {
      onEmpty: () => [],
      onNonEmpty: messages => [
        ChoseActionMenuAction({ tag }),
        ...(messages as ReadonlyArray<AppMessage>),
      ],
    })
  }

  const filterKey = (
    model: AppModel,
    menu: ActionMenu,
    focus: OnFilter,
    key: string,
    input: KeyInput,
  ): ReadonlyArray<AppMessage> => {
    if (key === 'Escape' || isToggleChord(input)) {
      return [DismissedActionMenu()]
    }
    if (key === 'Enter') {
      return Option.match(focus.maybeHighlighted, {
        onNone: () => [],
        onSome: tag => choose(model, tag),
      })
    }
    if (key === 'ArrowDown' || (key === 'Tab' && !input.isShift)) {
      return [MovedActionMenuFocus({ move: 'Next' })]
    }
    if (key === 'Backspace') {
      return menu.query === ''
        ? []
        : [ChangedActionMenuQuery({ query: menu.query.slice(0, -1) })]
    }
    if (isPrintable(key, input)) {
      return [ChangedActionMenuQuery({ query: `${menu.query}${key}` })]
    }
    return []
  }

  const listKey = (
    model: AppModel,
    focus: OnAction,
    key: string,
    input: KeyInput,
  ): ReadonlyArray<AppMessage> => {
    if (isToggleChord(input)) {
      return [DismissedActionMenu()]
    }
    if (key === 'Escape') {
      return [MovedActionMenuFocus({ move: 'Filter' })]
    }
    if (key === 'Enter') {
      return choose(model, focus.tag)
    }
    if (isChord(input) && key === 'ArrowDown') {
      return [MovedActionMenuFocus({ move: 'Last' })]
    }
    if (isChord(input) && key === 'ArrowUp') {
      return [MovedActionMenuFocus({ move: 'First' })]
    }
    if (key === 'J') {
      return [MovedActionMenuFocus({ move: 'Last' })]
    }
    if (key === 'K') {
      return [MovedActionMenuFocus({ move: 'First' })]
    }
    if (
      key === 'ArrowDown' ||
      key === 'j' ||
      (key === 'Tab' && !input.isShift)
    ) {
      return [MovedActionMenuFocus({ move: 'Next' })]
    }
    if (key === 'ArrowUp' || key === 'k' || (key === 'Tab' && input.isShift)) {
      return [MovedActionMenuFocus({ move: 'Previous' })]
    }
    return childInteraction.pressKey(
      childOf(model),
      input,
    ) as ReadonlyArray<AppMessage>
  }

  const closedKey = (
    model: AppModel,
    input: KeyInput,
  ): ReadonlyArray<AppMessage> =>
    Array.match(
      childInteraction.pressKey(
        childOf(model),
        input,
      ) as ReadonlyArray<AppMessage>,
      {
        onEmpty: () =>
          !isChord(input) && normalizeKey(input.key) === 'Escape'
            ? backMessages(navigation, model)
            : [],
        onNonEmpty: messages => messages,
      },
    )

  const pressKey = (
    model: AppModel,
    input: KeyInput,
  ): ReadonlyArray<AppMessage> => {
    const key = normalizeKey(input.key)
    return Option.match(menuOf(model.navigation), {
      onNone: () =>
        isOpenChord(input) ? [OpenedActionMenu()] : closedKey(model, input),
      onSome: menu =>
        M.value(menu.focus).pipe(
          M.withReturnType<ReadonlyArray<AppMessage>>(),
          M.tagsExhaustive({
            OnFilter: focus => filterKey(model, menu, focus, key, input),
            OnAction: focus => listKey(model, focus, key, input),
          }),
        ),
    })
  }

  const viewOfMenu = (
    model: AppModel,
    menu: ActionMenu,
    presentedStyle: PresentationStyle,
  ): MenuView =>
    menuViewOf(childInteraction.entries(childOf(model)), menu, presentedStyle)

  const menuView = (model: AppModel): Option.Option<MenuView> =>
    pipe(
      topEntry(model.navigation),
      Option.flatMap(entry =>
        Option.map(asMenu(entry.destination), menu =>
          viewOfMenu(model, menu, entry.style),
        ),
      ),
    )

  const interaction: ProgramInteraction<AppModel, AppMessage> = {
    menuKeys,
    status: model => childInteraction.status(childOf(model)),
    entries: model => childInteraction.entries(childOf(model)),
    press: (model, tag) =>
      childInteraction.press(childOf(model), tag) as ReadonlyArray<AppMessage>,
    pressKey,
    menu: menuView,
    openMenu: model => (isOpen(model) ? [] : [OpenedActionMenu()]),
    dismissMenu: model => (isOpen(model) ? [DismissedActionMenu()] : []),
    typeInMenu: (model, query) =>
      isOpen(model) ? [ChangedActionMenuQuery({ query })] : [],
    chooseFromMenu: choose,
  }

  const childSynchronization = child.synchronization
  const childSessionPolicyOf = childSynchronization?.sessionPolicyOf
  const childScreen = child.screen

  const program = make({
    id: config.id ?? `actionMenu:${child.id}`,
    version: config.version ?? child.version,
    Model,
    Message: AppMessageSchema,
    init,
    restore,
    update,
    interaction,
    navigation,
    synchronization: {
      messageCategory: message =>
        isMessage(message) ||
        (hold === 'Owns' && NavigationMessage.isMessage(message))
          ? 'Navigation'
          : (childSynchronization?.messageCategory(message as ChildMessage) ??
            'Domain'),
      projectDomain: model =>
        childSynchronization === undefined
          ? childOf(model)
          : childSynchronization.projectDomain(childOf(model)),
      ...(childSessionPolicyOf === undefined
        ? {}
        : {
            sessionPolicyOf: (model: AppModel) =>
              childSessionPolicyOf(childOf(model)),
          }),
    },
    ...(child.catalog === undefined ? {} : { catalog: child.catalog }),
    ...(childScreen === undefined
      ? {}
      : {
          screen: (
            model: AppModel,
            context?: Parameters<NonNullable<Child['screen']>>[1],
          ) => childScreen(childOf(model), context),
        }),
  })

  return Object.assign(program, { of: child }) as ActionMenuProgram<Child>
}
