/**
 * Program.compose.actionMenu — wrap one Program with a global Action menu.
 * Never two menus. Product Model stays on `product`.
 */
import { Array, Option, Schema as S } from 'effect'

import { mapMessages } from '../command/index.js'
import { md } from '../message/public.js'
import { Box, Button, Column, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'
import { ts } from '../schema/index.js'
import { evo } from '../struct/index.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramSchema,
  ProgramValidAction,
} from './program.js'
import { make } from './program.js'

/** A child Program for {@link actionMenu}. */
export type ActionMenuChild = Program<any, any, any, any, any>

/** Menu is not on screen. */
export const Closed = ts('Closed')
/** Menu is not on screen. */
export type Closed = typeof Closed.Type

/** Menu is on screen. `focus` is a row index. */
export const Open = ts('Open', {
  focus: S.Number,
  maybeQuery: S.Option(S.String),
})
/** Menu is on screen. `focus` is a row index. */
export type Open = typeof Open.Type

/** Action menu slice. `Closed | Open` makes two menus unrepresentable. */
export const ActionMenuModel = S.Union([Closed, Open])
/** Action menu slice. */
export type ActionMenuModel = typeof ActionMenuModel.Type

/** Opens the Action menu. */
export const ActionMenuCommandTriggered = md('ActionMenuCommandTriggered', {
  what: 'Opens the Action menu',
  why: 'User pressed cmd-K',
  keys: ['Meta+k', '?'],
  tokens: ['action-menu'],
})

/** Closes the Action menu. */
export const ActionMenuDismissed = md('ActionMenuDismissed', {
  what: 'Closes the Action menu',
  why: 'User pressed Esc or clicked out',
  keys: ['Escape'],
  tokens: ['action-menu-dismiss'],
})

/** Moves focus in the Action menu. */
export const ActionMenuFocusMoved = md('ActionMenuFocusMoved', {
  what: 'Moves focus in the menu',
  why: 'User pressed up or down',
  fields: {
    direction: S.Literals(['Up', 'Down']),
  },
})

/** Picks one menu row. */
export const ActionCommandMenuSelectionMade = md(
  'ActionCommandMenuSelectionMade',
  {
    what: 'Picks one menu row',
    why: 'User pressed Enter on a row',
    fields: { token: S.String },
  },
)

/** Filters the Action catalog while the menu is Open. */
export const ActionMenuQueryChanged = md('ActionMenuQueryChanged', {
  what: 'Filters the Action catalog',
  why: 'User typed a query in the menu',
  fields: { query: S.String },
})

/** Every Action menu Message. */
export const ActionMenuMessage = S.Union([
  ActionMenuCommandTriggered,
  ActionMenuDismissed,
  ActionMenuFocusMoved,
  ActionCommandMenuSelectionMade,
  ActionMenuQueryChanged,
])
/** An Action menu Message. */
export type ActionMenuMessage = typeof ActionMenuMessage.Type

const actionMenuTags: ReadonlySet<string> = new Set([
  'ActionMenuCommandTriggered',
  'ActionMenuDismissed',
  'ActionMenuFocusMoved',
  'ActionCommandMenuSelectionMade',
  'ActionMenuQueryChanged',
])

/** True when a Message belongs to the Action menu slice. */
export const isActionMenuMessage = (message: {
  readonly _tag: string
}): message is ActionMenuMessage => actionMenuTags.has(message._tag)

/** App Model: inner product plus the one Action menu. */
export type ActionMenuAppModel<Product> = Readonly<{
  product: Product
  actionMenu: ActionMenuModel
}>

/** App Message: inner Messages plus Action menu Messages. */
export type ActionMenuAppMessage<Inner> = Inner | ActionMenuMessage

/** Options for {@link actionMenu}. */
export type ActionMenuOptions = Readonly<{
  /** Program id. Default `actionMenu:${child.id}`. */
  id?: string
  /** Program version. Default is the child version. */
  version?: number
}>

/** A Program produced by {@link actionMenu}. */
export type ActionMenuProgram<Child extends ActionMenuChild> = Program<
  ActionMenuAppModel<ModelOf<Child>>,
  ActionMenuAppMessage<MessageOf<Child>> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  Readonly<{
    of: Child
    Closed: typeof Closed
    Open: typeof Open
    ActionMenuCommandTriggered: typeof ActionMenuCommandTriggered
    ActionMenuDismissed: typeof ActionMenuDismissed
    ActionMenuFocusMoved: typeof ActionMenuFocusMoved
    ActionCommandMenuSelectionMade: typeof ActionCommandMenuSelectionMade
    ActionMenuQueryChanged: typeof ActionMenuQueryChanged
  }>

const schemaMembers = (schema: unknown): ReadonlyArray<S.Top> => {
  if (
    typeof schema === 'object' &&
    schema !== null &&
    'members' in schema &&
    Array.isArray((schema as { readonly members: unknown }).members)
  ) {
    return (schema as { readonly members: ReadonlyArray<S.Top> }).members
  }
  return [schema as S.Top]
}

const readTag = (value: unknown): string => {
  if (
    typeof value === 'object' &&
    value !== null &&
    '_tag' in value &&
    typeof (value as { readonly _tag: unknown })._tag === 'string'
  ) {
    return (value as { readonly _tag: string })._tag
  }
  return ''
}

/** Catalog filter with no matching rows. */
export const FilteredEmpty = ts('Empty')
/** Catalog filter with no matching rows. */
export type FilteredEmpty = typeof FilteredEmpty.Type

/** Catalog filter that still has rows. */
export type FilteredMatches<Row> = Readonly<{
  _tag: 'Matches'
  rows: ReadonlyArray<Row>
}>

/** Named empty or the matching rows. Empty is not a crash. */
export type FilteredActions<Row> = FilteredEmpty | FilteredMatches<Row>

const tokenOfRow = (row: ProgramValidAction, index: number): string => {
  if (row.token !== '') {
    return row.token
  }
  return `row-${String(index)}`
}

/** Host-only chosen flash length. Not a Model fact. */
export const actionMenuChosenMs = 120

/** First Action key, short. Empty when the Action declares none. */
export const actionMenuKeyHint = (keys: ReadonlyArray<string>): string => {
  const maybeKey = Array.head(keys)
  if (Option.isNone(maybeKey)) {
    return ''
  }
  return `[ ${maybeKey.value} ] `
}

/**
 * Visible highlight. None when the filter is Empty (hole 7).
 * A Some index is always a member of the visible NonEmpty.
 */
export const highlightIndex = (
  menu: Open,
  filtered: FilteredActions<unknown>,
): Option.Option<number> => {
  if (filtered._tag === 'Empty') {
    return Option.none()
  }
  if (menu.focus < 0 || menu.focus >= filtered.rows.length) {
    return Option.none()
  }
  return Option.some(menu.focus)
}

/**
 * Next focus after a filter change.
 * Keep the same token when it still matches. If it drops, first remaining,
 * or last when the old index is past the new list (going up).
 */
export const focusAfterFilter = <Row extends { readonly token: string }>(
  previousFocus: number,
  previousRows: ReadonlyArray<Row>,
  next: FilteredActions<Row>,
): Option.Option<number> => {
  if (next._tag === 'Empty') {
    return Option.none()
  }
  const lastIndex = next.rows.length - 1
  const maybePrevious = Array.get(previousRows, previousFocus)
  if (Option.isSome(maybePrevious)) {
    const maybeStill = Array.findFirstIndex(
      next.rows,
      row => row.token === maybePrevious.value.token,
    )
    if (Option.isSome(maybeStill)) {
      return maybeStill
    }
  }
  if (previousFocus > lastIndex) {
    return Option.some(lastIndex)
  }
  return Option.some(0)
}

const fuzzyMatches = (token: string, query: string): boolean => {
  const haystack = token.toLowerCase()
  const needle = query.toLowerCase()
  if (haystack.includes(needle)) {
    return true
  }
  const needleChars = Array.fromIterable(needle)
  let needleIndex = 0
  for (const character of haystack) {
    const maybeNeedle = Array.get(needleChars, needleIndex)
    if (Option.isNone(maybeNeedle)) {
      return true
    }
    if (character === maybeNeedle.value) {
      needleIndex += 1
    }
  }
  return needleIndex >= needleChars.length
}

/**
 * Filters catalog rows by maybeQuery.
 * Empty query keeps every row. No matches is named Empty.
 */
export const filterByQuery = <Row extends { readonly token: string }>(
  rows: ReadonlyArray<Row>,
  maybeQuery: Option.Option<string>,
): FilteredActions<Row> => {
  const query = Option.getOrElse(maybeQuery, () => '')
  const matched =
    query === ''
      ? rows
      : Array.filter(rows, row => fuzzyMatches(row.token, query))
  return Array.match(matched, {
    onEmpty: () => FilteredEmpty(),
    onNonEmpty: visible => ({ _tag: 'Matches', rows: visible }),
  })
}

const visibleRowsOf = <Row extends { readonly token: string }>(
  filtered: FilteredActions<Row>,
): ReadonlyArray<Row> => {
  if (filtered._tag === 'Empty') {
    return []
  }
  return filtered.rows
}

const wrapFocus = (focus: number, rowCount: number, delta: number): number => {
  if (rowCount <= 0) {
    return 0
  }
  return (focus + delta + rowCount) % rowCount
}

const rowsOf = <Child extends ActionMenuChild>(
  child: Child,
  product: ModelOf<Child>,
): ReadonlyArray<ProgramValidAction> => {
  if (child.valid === undefined) {
    return []
  }
  return child.valid(product, {})
}

const actionByTokenOf = <Child extends ActionMenuChild>(
  child: Child,
  token: string,
): MessageOf<Child> | undefined => {
  if (
    !('actionByToken' in child) ||
    typeof child.actionByToken !== 'function'
  ) {
    return undefined
  }
  const found = (child.actionByToken as (value: string) => unknown)(token)
  if (found === undefined || found === null) {
    return undefined
  }
  if (typeof found === 'function') {
    return found() as MessageOf<Child>
  }
  return found as MessageOf<Child>
}

const menuLabel = (row: ProgramValidAction, isFocused: boolean): string => {
  const mark = isFocused ? '> ' : ''
  const hint = actionMenuKeyHint(row.keys)
  if (row.valid) {
    return `${mark}${hint}${row.token}`
  }
  if (row.hidden === undefined) {
    return `${mark}${hint}${row.token}`
  }
  return `${mark}${hint}${row.token}: ${row.hidden}`
}

const actionMenuScreen = (
  filtered: FilteredActions<ProgramValidAction>,
  menu: Open,
): UiNode => {
  const rows = visibleRowsOf(filtered)
  const maybeHighlight = highlightIndex(menu, filtered)
  const body =
    filtered._tag === 'Empty'
      ? Text('Empty')
      : Column(
          { gap: 1 },
          ...Array.map(rows, (row, index) =>
            Button({
              token: `action-menu:${tokenOfRow(row, index)}`,
              label: menuLabel(
                row,
                Option.isSome(maybeHighlight) && maybeHighlight.value === index,
              ),
              disabled: !row.valid,
            }),
          ),
        )
  const query = Option.getOrElse(menu.maybeQuery, () => '')
  return Box(
    { padding: 1 },
    Text(query === '' ? 'Actions' : `Actions  ${query}`),
    body,
    Button({
      token: 'action-menu-dismiss',
      label: 'Close',
      variant: 'Ghost',
    }),
  )
}

/**
 * Compose one Program with a global Action menu.
 *
 * ```ts
 * const App = Program.compose.actionMenu({
 *   of: CounterProgram,
 * })
 * ```
 */
export const actionMenu = <Child extends ActionMenuChild>(config: {
  of: Child
  id?: string
  version?: number
}): ActionMenuProgram<Child> => {
  const child = config.of
  type Product = ModelOf<Child>
  type InnerMessage = MessageOf<Child>
  type Model = ActionMenuAppModel<Product>
  type Message = ActionMenuAppMessage<InnerMessage> & Readonly<{ _tag: string }>

  const Model = S.Struct({
    product: child.Model,
    actionMenu: ActionMenuModel,
  }) as ProgramSchema<Model>

  const messageMembers = [
    ...schemaMembers(child.Message),
    ActionMenuCommandTriggered,
    ActionMenuDismissed,
    ActionMenuFocusMoved,
    ActionCommandMenuSelectionMade,
    ActionMenuQueryChanged,
  ]
  const Message = S.Union(messageMembers as never) as ProgramSchema<Message>

  const init = (): readonly [
    Model,
    ReadonlyArray<ProgramCommand<Message, any>>,
  ] => {
    const [product, productCommands] = child.init()
    return [
      { product, actionMenu: Closed() },
      productCommands as ReadonlyArray<ProgramCommand<Message, any>>,
    ]
  }

  const restore = (
    model: Model,
  ): readonly [Model, ReadonlyArray<ProgramCommand<Message, any>>] => {
    if (child.restore === undefined) {
      return [model, []]
    }
    const [product, productCommands] = child.restore(model.product)
    return [
      { product, actionMenu: model.actionMenu },
      productCommands as ReadonlyArray<ProgramCommand<Message, any>>,
    ]
  }

  const applyInner = (
    model: Model,
    inner: InnerMessage,
    nextMenu: ActionMenuModel,
  ): readonly [Model, ReadonlyArray<ProgramCommand<Message, any>>] => {
    const [product, productCommands] = child.update(model.product, inner)
    return [
      { product, actionMenu: nextMenu },
      mapMessages(productCommands, message => message as Message),
    ]
  }

  const update = (
    model: Model,
    message: Message,
  ): readonly [Model, ReadonlyArray<ProgramCommand<Message, any>>] => {
    const tag = readTag(message)
    if (tag === 'ActionMenuCommandTriggered') {
      if (model.actionMenu._tag === 'Open') {
        return [{ product: model.product, actionMenu: Closed() }, []]
      }
      return [
        {
          product: model.product,
          actionMenu: Open.make({
            focus: 0,
            maybeQuery: Option.none(),
          }),
        },
        [],
      ]
    }
    if (tag === 'ActionMenuDismissed') {
      return [{ product: model.product, actionMenu: Closed() }, []]
    }
    if (tag === 'ActionMenuQueryChanged') {
      if (model.actionMenu._tag === 'Closed') {
        return [model, []]
      }
      const query = (message as ReturnType<typeof ActionMenuQueryChanged>).query
      const maybeQuery = query === '' ? Option.none() : Option.some(query)
      const catalog = rowsOf(child, model.product)
      const previousVisible = visibleRowsOf(
        filterByQuery(catalog, model.actionMenu.maybeQuery),
      )
      const nextVisible = filterByQuery(catalog, maybeQuery)
      const maybeFocus = focusAfterFilter(
        model.actionMenu.focus,
        previousVisible,
        nextVisible,
      )
      return [
        {
          product: model.product,
          actionMenu: Open.make({
            focus: Option.getOrElse(maybeFocus, () => 0),
            maybeQuery,
          }),
        },
        [],
      ]
    }
    if (tag === 'ActionMenuFocusMoved') {
      if (model.actionMenu._tag === 'Closed') {
        return [model, []]
      }
      const direction = (message as ReturnType<typeof ActionMenuFocusMoved>)
        .direction
      const visible = filterByQuery(
        rowsOf(child, model.product),
        model.actionMenu.maybeQuery,
      )
      const rowCount = visibleRowsOf(visible).length
      const delta = direction === 'Up' ? -1 : 1
      return [
        {
          product: model.product,
          actionMenu: evo(model.actionMenu, {
            focus: n => wrapFocus(n, rowCount, delta),
          }),
        },
        [],
      ]
    }
    if (tag === 'ActionCommandMenuSelectionMade') {
      if (model.actionMenu._tag === 'Closed') {
        return [model, []]
      }
      const token = (
        message as ReturnType<typeof ActionCommandMenuSelectionMade>
      ).token
      const visible = filterByQuery(
        rowsOf(child, model.product),
        model.actionMenu.maybeQuery,
      )
      const row = Array.findFirst(
        visibleRowsOf(visible),
        candidate => candidate.token === token,
      )
      if (Option.isNone(row) || !row.value.valid) {
        return [model, []]
      }
      const inner = actionByTokenOf(child, token)
      if (inner === undefined) {
        return [model, []]
      }
      return applyInner(model, inner, Closed())
    }
    const nextMenu =
      model.actionMenu._tag === 'Open' ? Closed() : model.actionMenu
    return applyInner(model, message as InnerMessage, nextMenu)
  }

  const valid =
    child.valid === undefined
      ? undefined
      : (model: Model, context?: Parameters<NonNullable<Child['valid']>>[1]) =>
          child.valid!(model.product, context)

  const screen =
    child.screen === undefined
      ? undefined
      : (
          model: Model,
          context?: Parameters<NonNullable<Child['screen']>>[1],
        ) => {
          const productScreen = child.screen!(model.product, context)
          if (model.actionMenu._tag === 'Closed') {
            return productScreen
          }
          return Column(
            { gap: 1 },
            productScreen,
            actionMenuScreen(
              filterByQuery(
                rowsOf(child, model.product),
                model.actionMenu.maybeQuery,
              ),
              model.actionMenu,
            ),
          )
        }

  const program = make({
    id: config.id ?? `actionMenu:${child.id}`,
    version: config.version ?? child.version,
    Model,
    Message,
    init,
    restore,
    update,
    ...(valid === undefined ? {} : { valid }),
    ...(screen === undefined ? {} : { screen }),
  })

  return Object.assign(program, {
    of: child,
    Closed,
    Open,
    ActionMenuCommandTriggered,
    ActionMenuDismissed,
    ActionMenuFocusMoved,
    ActionCommandMenuSelectionMade,
    ActionMenuQueryChanged,
  }) as ActionMenuProgram<Child>
}

/** Token prefix painted for a menu row. */
export const actionMenuSelectPrefix = 'action-menu:'

/** Token painted for dismiss. */
export const actionMenuDismissToken = 'action-menu-dismiss'

/**
 * Reads the Action token from a painted menu row token.
 * Product tokens are returned unchanged.
 */
export const tokenFromActionMenuToken = (token: string): string => {
  if (token === actionMenuDismissToken) {
    return token
  }
  if (token.startsWith(actionMenuSelectPrefix)) {
    return token.slice(actionMenuSelectPrefix.length)
  }
  return token
}
