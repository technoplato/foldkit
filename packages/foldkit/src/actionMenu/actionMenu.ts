import {
  Array,
  Data,
  Match as M,
  Option,
  Order,
  Predicate,
  Result,
  Schema as S,
  pipe,
} from 'effect'

import { type Entry } from '../catalog/catalog.js'
import { mapMessages } from '../command/index.js'
import {
  type KeyInput,
  type MenuRow,
  type MenuView,
  type ProgramInteraction,
  isChord,
  normalizeKey,
} from '../interaction/interaction.js'
import {
  Dialog,
  NavigationStack,
  type PresentationStyle,
  popped,
  presented,
  pushed,
  stackAtRoot,
  topEntry,
} from '../navigation/structure.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramNavigation,
  ProgramSchema,
} from '../program/program.js'
import { make } from '../program/program.js'
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

// MESSAGE

/** A person opened the action menu with Cmd-K, `?`, or its button. */
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
 * A person chose a row, which closes the menu. The chosen Action is sent as
 * its own Message, so the tape records `Increment`, not a wrapper.
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

const isSubsequence = (needle: string, haystack: string): boolean =>
  Array.reduce(Array.fromIterable(haystack), 0, (matched, character) =>
    matched < needle.length && needle.charAt(matched) === character
      ? matched + 1
      : matched,
  ) === needle.length

const PrefixMatch = 0
const WordMatch = 1
const DescriptionMatch = 2
const LooseMatch = 3

const matchRank = (entry: Entry, needle: string): Option.Option<number> => {
  const words = `${entry.label} ${entry.tag}`.toLowerCase()
  if (
    entry.tag.toLowerCase().startsWith(needle) ||
    entry.label.toLowerCase().startsWith(needle)
  ) {
    return Option.some(PrefixMatch)
  } else if (words.includes(needle)) {
    return Option.some(WordMatch)
  } else if (entry.what.toLowerCase().includes(needle)) {
    return Option.some(DescriptionMatch)
  } else if (isSubsequence(needle, words)) {
    return Option.some(LooseMatch)
  } else {
    return Option.none()
  }
}

/**
 * The rows a query leaves visible. An empty query keeps every row in
 * Catalog order. Otherwise rows rank by how they match, then by Catalog
 * order: a tag or label prefix first, then a substring of the label and
 * tag, then a substring of `what`, then a loose subsequence. `re` puts
 * Reset first; `rst` finds only Reset.
 */
export const visibleEntries = (
  catalogEntries: ReadonlyArray<Entry>,
  query: string,
): ReadonlyArray<Entry> => {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return catalogEntries
  }
  return pipe(
    catalogEntries,
    Array.filterMap((entry, index) =>
      Option.match(matchRank(entry, needle), {
        onNone: () => Result.failVoid,
        onSome: rank => Result.succeed({ entry, rank, index }),
      }),
    ),
    Array.sort(
      Order.combine(
        Order.mapInput(Order.Number, (ranked: RankedEntry) => ranked.rank),
        Order.mapInput(Order.Number, (ranked: RankedEntry) => ranked.index),
      ),
    ),
    Array.map(ranked => ranked.entry),
  )
}

type RankedEntry = Readonly<{ entry: Entry; rank: number; index: number }>

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

/** The destinations a composed child can occupy. */
export type DestinationOf<Child> =
  Child extends Readonly<{
    navigation?: ProgramNavigation<any, infer Destination>
  }>
    ? Destination
    : never

/** The composed Model: the child's fields, flat, plus the navigation stack. */
export type ActionMenuModel<Child extends ActionMenuChild> = ModelOf<Child> &
  Readonly<{
    navigation: NavigationStack<DestinationOf<Child> | ActionMenu>
  }>

/** The composed Message: the child's Messages unwrapped plus menu Messages. */
export type ActionMenuMessage<Child extends ActionMenuChild> =
  | MessageOf<Child>
  | Message

/** A Program produced by {@link compose}. */
export type ActionMenuProgram<Child extends ActionMenuChild> = Program<
  ActionMenuModel<Child>,
  ActionMenuMessage<Child> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  Readonly<{ of: Child }>

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

const membersOf = (schema: unknown): ReadonlyArray<S.Top> => {
  if (
    Predicate.hasProperty(schema, 'members') &&
    Array.isArray(schema.members)
  ) {
    return schema.members as ReadonlyArray<S.Top>
  }
  return [schema as S.Top]
}

const isToggleChord = (key: string, input: KeyInput): boolean =>
  isChord(input) && key.toLowerCase() === 'k'

const isOpenChord = (key: string, input: KeyInput): boolean =>
  isToggleChord(key, input) || (!isChord(input) && key === '?')

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
  type AppDestination = DestinationOf<Child> | ActionMenu
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
  const childFields = structFieldsOf(child.Model, child.id)
  if (Object.hasOwn(childFields, 'navigation')) {
    throw new ActionMenuReservedFieldError({
      field: 'navigation',
      programId: child.id,
    })
  }
  const style = config.style ?? Dialog()

  const Destination = S.Union([
    ...membersOf(childNavigation.Destination),
    ActionMenu,
  ])
  const Model = S.Struct({
    ...childFields,
    navigation: NavigationStack(Destination),
  }) as unknown as ProgramSchema<AppModel>
  const AppMessageSchema = S.Union([
    ...membersOf(child.Message),
    ...Message.members,
  ]) as unknown as ProgramSchema<AppMessage>

  const childOf = (model: AppModel): ChildModel => {
    const { navigation: _navigation, ...childModel } = model
    return childModel as ChildModel
  }

  const withChild = (model: AppModel, childModel: ChildModel): AppModel => ({
    ...childModel,
    navigation: model.navigation,
  })

  const visibleOf = (model: AppModel, query: string): ReadonlyArray<Entry> =>
    visibleEntries(childInteraction.entries(childOf(model)), query)

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
          Option.isSome(menuOf(model.navigation))
            ? [model, []]
            : withNavigation(
                model,
                pushed<AppDestination>(
                  model.navigation,
                  presented<AppDestination>(
                    opened(visibleOf(model, '')),
                    style,
                  ),
                ),
              ),
        DismissedActionMenu: () =>
          withNavigation(model, dismissMenu<AppDestination>(model.navigation)),
        ChangedActionMenuQuery: ({ query }) =>
          Option.match(menuOf(model.navigation), {
            onNone: () => [model, []],
            onSome: menu =>
              withNavigation(
                model,
                replaceMenu<DestinationOf<Child>>(
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
                replaceMenu<DestinationOf<Child>>(
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
      { ...childModel, navigation: stackAtRoot(childNavigation.root) },
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
        ...(messages as ReadonlyArray<AppMessage>),
        ChoseActionMenuAction({ tag }),
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
    if (key === 'Escape' || isToggleChord(key, input)) {
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
    if (isToggleChord(key, input)) {
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

  const pressKey = (
    model: AppModel,
    input: KeyInput,
  ): ReadonlyArray<AppMessage> => {
    const key = normalizeKey(input.key)
    return Option.match(menuOf(model.navigation), {
      onNone: () =>
        isOpenChord(key, input)
          ? [OpenedActionMenu()]
          : (childInteraction.pressKey(
              childOf(model),
              input,
            ) as ReadonlyArray<AppMessage>),
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

  const rowOf =
    (focus: Focus) =>
    (entry: Entry): MenuRow => ({
      entry,
      isHighlighted: Option.contains(highlightedTag(focus), entry.tag),
      isFocused: focus._tag === 'OnAction' && focus.tag === entry.tag,
    })

  const menuView = (model: AppModel): Option.Option<MenuView> =>
    pipe(
      topEntry(model.navigation),
      Option.flatMap(entry =>
        isActionMenu(entry.destination)
          ? Option.some({ menu: entry.destination, style: entry.style })
          : Option.none(),
      ),
      Option.map(({ menu, style: presentedStyle }) => ({
        query: menu.query,
        isFilterFocused: menu.focus._tag === 'OnFilter',
        rows: Array.map(visibleOf(model, menu.query), rowOf(menu.focus)),
        style: presentedStyle,
      })),
    )

  const interaction: ProgramInteraction<AppModel, AppMessage> = {
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
    navigation: {
      Destination: Destination as unknown as ProgramSchema<
        DestinationOf<Child> | ActionMenu
      >,
      root: childNavigation.root,
      stackOf: (model: AppModel) => model.navigation,
    },
    synchronization: {
      messageCategory: message =>
        isMessage(message)
          ? 'Navigation'
          : (childSynchronization?.messageCategory(message as ChildMessage) ??
            'Domain'),
      projectDomain: model =>
        childSynchronization === undefined
          ? childOf(model)
          : childSynchronization.projectDomain(childOf(model)),
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
