import { Array, Match as M, Option, Record, pipe } from 'effect'

import {
  type Entry,
  choiceTagOf,
  isEnabled,
  parseChoiceTag,
} from '../catalog/catalog.js'
import type { EntryView } from '../navigation/declaration.js'
import { type Frame, type FrameLayer, frameOf } from '../navigation/frame.js'
import { Link, type UriVia } from '../navigation/message.js'
import { isModalStyle } from '../navigation/structure.js'
import { Button, Column, Row, Text } from '../renderers/elements.js'
import { resolveLazyNode } from '../renderers/lazy.js'
import { buttonsOf } from '../renderers/query.js'
import type {
  ButtonNode,
  ItemMenu,
  ListItem,
  ListNode,
  UiNode,
} from '../renderers/types.js'
import type { BoundInteraction } from './bind.js'
import {
  type KeyInput,
  isChord,
  keyedEntryOf,
  normalizeKey,
} from './interaction.js'
import { type TerminalKeyOutcome, pressTerminalKey } from './terminal.js'

// MODEL

/**
 * Which button a terminal highlights on each screen, by the screen's
 * identity: `{ '/counters': 'Reset:2' }`. A screen keeps its highlight
 * while a dialog over it has the keyboard, so closing "Delete Counter 2?"
 * lands back on the button that opened it. A page whose address follows a
 * moving place keeps its highlight as the place moves: the player at
 * `/books/a-tin-comet/listen/12m03s` and at `…/12m04s` is one page, keyed
 * `/books/a-tin-comet/listen/0s`.
 */
export type TerminalFocus = Readonly<Record<string, string>>

/** No button highlighted yet. */
export const noTerminalFocus: TerminalFocus = {}

/**
 * Merges synced focus from the bound Program over any view-local terminal
 * focus so Programs wrapped in `Session.compose` use Model-owned synced focus
 * while plain unwrapped Programs still keep local focus working.
 */
export const effectiveFocusOf = (
  bound: Readonly<{ focus?: () => Readonly<Record<string, string>> }>,
  localFocus: TerminalFocus = noTerminalFocus,
): TerminalFocus => {
  const syncedFocus = bound.focus?.()
  if (syncedFocus === undefined || Record.isEmptyRecord(syncedFocus)) {
    return localFocus
  }
  return Record.isEmptyRecord(localFocus)
    ? syncedFocus
    : { ...localFocus, ...syncedFocus }
}

const isEnabledActionKey = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  input: KeyInput,
): boolean =>
  Option.exists(keyedEntryOf(bound.entries(), input), entry =>
    isEnabled(entry.availability),
  )

/**
 * How a key moves the highlight: Tab, Shift-Tab, and the arrows. Left and
 * Right step through every button in order and wrap; Up and Down change
 * row and keep the column.
 */
export type FocusMove = 'Next' | 'Previous' | 'Up' | 'Down'

type FocusGrid = ReadonlyArray<ReadonlyArray<string>>

type GridRow = Readonly<{ tags: ReadonlyArray<string>; isCurrent: boolean }>

/**
 * How a key moves the terminal highlight. None for any other key.
 *
 * @example
 * ```typescript
 * focusMoveOf(keyInput('ArrowDown')) // Some('Down')
 * focusMoveOf(keyInput('Tab', { isShift: true })) // Some('Previous')
 * focusMoveOf(keyInput('r')) // None
 * ```
 */
export const focusMoveOf = (input: KeyInput): Option.Option<FocusMove> => {
  const key = normalizeKey(input.key)
  if (isChord(input)) {
    return Option.none()
  } else if (key === 'Tab') {
    return Option.some(input.isShift ? 'Previous' : 'Next')
  } else if (key === 'ArrowRight') {
    return Option.some('Next')
  } else if (key === 'ArrowLeft') {
    return Option.some('Previous')
  } else if (key === 'ArrowDown') {
    return Option.some('Down')
  } else if (key === 'ArrowUp') {
    return Option.some('Up')
  } else {
    return Option.none()
  }
}

// GRID

const isLinkTag = (tag: string): boolean => tag.startsWith('/')

const pressableTagOf = (button: ButtonNode): Option.Option<string> =>
  button.disabled === true ? Option.none() : Option.fromNullishOr(button.action)

const gridRowsOfNode = (node: UiNode): ReadonlyArray<GridRow> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<GridRow>>(),
    M.tagsExhaustive({
      Text: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Button: button =>
        Array.fromOption(
          Option.map(pressableTagOf(button), tag => ({
            tags: [tag],
            isCurrent: false,
          })),
        ),
      Row: row =>
        Array.match(Array.getSomes(Array.map(buttonsOf(row), pressableTagOf)), {
          onEmpty: () => [],
          onNonEmpty: tags => [{ tags, isCurrent: false }],
        }),
      Column: column => Array.flatMap(column.children, gridRowsOfNode),
      Box: box => Array.flatMap(box.children, gridRowsOfNode),
      Progress: () => [],
      List: list =>
        Array.flatMap(list.items, item => {
          const itemRow: GridRow = {
            tags: [
              ...Array.fromNullishOr(item.check?.action),
              ...Array.fromNullishOr(item.action ?? item.href),
              ...Array.getSomes(Array.map(item.trailing ?? [], pressableTagOf)),
            ],
            isCurrent: item.isCurrent === true,
          }
          if (list.menu !== undefined && list.menu.key === item.key) {
            return [
              itemRow,
              {
                tags: [
                  ...Array.map(list.menu.items, menuItem => menuItem.action),
                  list.menu.dismissAction,
                ],
                isCurrent: false,
              },
            ]
          } else {
            return [itemRow]
          }
        }),
      Seek: () => [],
      Transcript: () => [],
      DeviceShell: shell => Array.flatMap(shell.children, gridRowsOfNode),
      Lazy: lazy => gridRowsOfNode(resolveLazyNode(lazy)),
    }),
  )

const gridRowsOfView = (view: EntryView): ReadonlyArray<GridRow> =>
  view._tag === 'Screen' ? gridRowsOfNode(view.node) : []

const gridOfRows = (rows: ReadonlyArray<GridRow>): FocusGrid =>
  Array.filter(
    Array.map(rows, row => row.tags),
    Array.isReadonlyArrayNonEmpty,
  )

const gridOfView = (view: EntryView): FocusGrid =>
  gridOfRows(gridRowsOfView(view))

const keyboardLayerOf = (frame: Frame): FrameLayer =>
  Option.getOrElse(Array.last(frame.overlays), () => frame.base)

const isPresented = (layer: FrameLayer): boolean =>
  Option.isSome(layer.maybeStyle)

const isModal = (layer: FrameLayer): boolean =>
  Option.exists(layer.maybeStyle, isModalStyle)

const isFollowingNode = (node: UiNode): boolean =>
  M.value(node).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      Text: () => false,
      TextInput: () => false,
      Spacer: () => false,
      Button: () => false,
      Progress: () => false,
      List: () => false,
      Seek: () => false,
      Transcript: transcript =>
        Array.some(transcript.passages, passage => passage.isCurrent === true),
      Row: row => Array.some(row.children, isFollowingNode),
      Column: column => Array.some(column.children, isFollowingNode),
      Box: box => Array.some(box.children, isFollowingNode),
      DeviceShell: shell => Array.some(shell.children, isFollowingNode),
      Lazy: lazy => isFollowingNode(resolveLazyNode(lazy)),
    }),
  )

const isFollowingAlong = (view: EntryView): boolean =>
  view._tag === 'Screen' && isFollowingNode(view.node)

const highlightsAtOnce = (layer: FrameLayer): boolean =>
  isModal(layer) || (isPresented(layer) && !isFollowingAlong(layer.view))

const isInGrid = (grid: FocusGrid, tag: string): boolean =>
  Array.some(grid, row => Array.contains(row, tag))

const firstOf = (grid: FocusGrid): Option.Option<string> =>
  Array.head(Array.flatten(grid))

const nearCurrentOf = (rows: ReadonlyArray<GridRow>): Option.Option<string> =>
  Option.orElse(
    Option.flatMap(
      Array.findFirstIndex(rows, row => row.isCurrent),
      currentIndex =>
        Option.flatMap(
          Array.findFirst(Array.drop(rows, currentIndex), row =>
            Array.isReadonlyArrayNonEmpty(row.tags),
          ),
          row => Array.head(row.tags),
        ),
    ),
    () => firstOf(gridOfRows(rows)),
  )

/**
 * The button a terminal highlights on the screen that has the keyboard:
 * the one kept for that screen while it is still there. A dialog or sheet
 * highlights a row until a key moves it, so Enter answers it at once: the
 * current row, or the first after it that presses, such as the chapter
 * playing in a book's contents, else its first button. A page pushed
 * above another highlights its first button at once too, unless it
 * follows something that moves, such as a player's words being spoken:
 * that page, like the root, highlights nothing until the first arrow, so
 * a terminal keeps the words in view instead of the Back button.
 *
 * @example
 * ```typescript
 * focusedTagOf(frame, { '/counters': 'Reset:2' }) // Some('Reset:2')
 * focusedTagOf(frameWithDeleteQuestion, noTerminalFocus) // Some('ConfirmDelete:2')
 * focusedTagOf(frameWithContentsAtChapter3, noTerminalFocus) // Some('JumpToChapter:4')
 * ```
 */
export const focusedTagOf = (
  frame: Frame,
  focus: TerminalFocus,
): Option.Option<string> => {
  const layer = keyboardLayerOf(frame)
  const rows = gridRowsOfView(layer.view)
  const grid = gridOfRows(rows)
  const maybeKept = Option.filter(Record.get(focus, layer.identity), tag =>
    isInGrid(grid, tag),
  )
  return highlightsAtOnce(layer)
    ? Option.orElse(maybeKept, () => nearCurrentOf(rows))
    : maybeKept
}

const positionOf = (
  grid: FocusGrid,
  tag: string,
): Option.Option<readonly [number, number]> =>
  Array.head(
    Array.getSomes(
      Array.map(grid, (row, rowIndex) =>
        Option.map(
          Array.findFirstIndex(row, candidate => candidate === tag),
          (column): readonly [number, number] => [rowIndex, column],
        ),
      ),
    ),
  )

const steppedLinear = (
  grid: FocusGrid,
  tag: string,
  step: number,
): Option.Option<string> => {
  const tags = Array.flatten(grid)
  return pipe(
    Array.findFirstIndex(tags, candidate => candidate === tag),
    Option.flatMap(index =>
      Array.get(tags, (index + step + tags.length) % tags.length),
    ),
  )
}

const steppedRow = (
  grid: FocusGrid,
  tag: string,
  step: number,
): Option.Option<string> =>
  Option.flatMap(positionOf(grid, tag), ([row, column]) => {
    const nextRow = Math.min(Math.max(row + step, 0), grid.length - 1)
    return Option.flatMap(Array.get(grid, nextRow), cells =>
      Array.get(cells, Math.min(column, cells.length - 1)),
    )
  })

const movedTag = (
  grid: FocusGrid,
  maybeFocused: Option.Option<string>,
  move: FocusMove,
): Option.Option<string> =>
  Option.match(maybeFocused, {
    onNone: () => firstOf(grid),
    onSome: tag =>
      M.value(move).pipe(
        M.withReturnType<Option.Option<string>>(),
        M.when('Next', () => steppedLinear(grid, tag, 1)),
        M.when('Previous', () => steppedLinear(grid, tag, -1)),
        M.when('Down', () => steppedRow(grid, tag, 1)),
        M.when('Up', () => steppedRow(grid, tag, -1)),
        M.exhaustive,
      ),
  })

// PRESS

/** A key press in a terminal and the highlight it leaves. */
export type TerminalFocusOutcome = Readonly<{
  outcome: TerminalKeyOutcome
  focus: TerminalFocus
}>

const rowChoiceTagOf = (
  entries: ReadonlyArray<Entry>,
  focusedTag: string,
  input: KeyInput,
): Option.Option<string> =>
  isChord(input)
    ? Option.none()
    : Option.flatMap(parseChoiceTag(focusedTag), ({ token }) =>
        Array.findFirst(entries, entry =>
          Option.exists(
            entry.maybeChoices,
            choices =>
              Array.contains(choices.keys, normalizeKey(input.key)) &&
              Array.some(
                choices.choices,
                choice =>
                  choice.token === token && isEnabled(choice.availability),
              ),
          ),
        ).pipe(Option.map(entry => choiceTagOf(entry.tag, token))),
      )

/**
 * Presses one key in a terminal that highlights buttons. The arrows and
 * Tab move the highlight across the screen that has the keyboard, Enter
 * presses the highlighted button, and an Action's key acts on the
 * highlighted row: with `Increment:2` highlighted, `r` resets Counter 2.
 * Every other key, and every key while the action menu is open, goes to
 * {@link pressTerminalKey}.
 *
 * @example
 * ```typescript
 * const { outcome, focus: nextFocus } = pressTerminalKeyAt(bound, terminalKeyInput(event), focus)
 * ```
 */
export const pressTerminalKeyAt = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  input: KeyInput,
  focus: TerminalFocus,
): TerminalFocusOutcome => {
  const effectiveFocus = effectiveFocusOf(bound, focus)
  const passedOn = (): TerminalFocusOutcome => ({
    outcome: pressTerminalKey(bound, input),
    focus: effectiveFocus,
  })
  if (Option.isSome(bound.menu())) {
    return passedOn()
  }
  const key = normalizeKey(input.key)
  if (
    (key === 'ArrowLeft' || key === 'ArrowRight') &&
    isEnabledActionKey(bound, input)
  ) {
    return passedOn()
  }
  return Option.match(frameOf(bound), {
    onNone: passedOn,
    onSome: frame => {
      const layer = keyboardLayerOf(frame)
      const grid = gridOfView(layer.view)
      const maybeFocused = focusedTagOf(frame, effectiveFocus)
      const maybeMoved = Option.flatMap(focusMoveOf(input), move =>
        movedTag(grid, maybeFocused, move),
      )
      if (Option.isSome(maybeMoved)) {
        bound.focusTarget(layer.identity, maybeMoved.value)
        return {
          outcome: 'Handled',
          focus: Record.set(effectiveFocus, layer.identity, maybeMoved.value),
        }
      }
      const maybePressed = Option.flatMap(maybeFocused, focusedTag =>
        key === 'Enter' && !isChord(input)
          ? Option.some(focusedTag)
          : rowChoiceTagOf(bound.entries(), focusedTag, input),
      )
      return Option.match(maybePressed, {
        onNone: passedOn,
        onSome: tag =>
          (isLinkTag(tag) ? bound.openUri(tag, Link()) : bound.press(tag))
            ? { outcome: 'Handled', focus: effectiveFocus }
            : passedOn(),
      })
    },
  })
}

const isInteractiveDomElement = (target: EventTarget | null): boolean => {
  if (target === null || typeof HTMLElement === 'undefined') {
    return false
  }
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  ) {
    return true
  }
  return (
    target.closest('button, a, input, textarea, select, [role="button"]') !==
    null
  )
}

/**
 * Handles ArrowUp / ArrowDown (and Enter when no native button/link holds DOM
 * focus) on a browser document for synced screen focus. Leaves Tab, typing in
 * fields, overlays that manage their own focus, and Catalog shortcuts alone.
 */
export const pressDocumentFocusKey = (
  bound: Readonly<{
    menu?: () => Option.Option<unknown>
    navigation?: () => Option.Option<any>
    viewAt?: (key: string) => Option.Option<EntryView>
    focus?: () => Readonly<Record<string, string>>
    focusTarget?: (screen: string, target: string) => boolean
    press?: (tag: string) => boolean
    openUri?: (uri: string, via: UriVia) => boolean
  }>,
  input: KeyInput,
  eventTarget: EventTarget | null,
): boolean => {
  if (
    bound.focusTarget === undefined ||
    bound.focus === undefined ||
    bound.navigation === undefined ||
    bound.viewAt === undefined ||
    isChord(input)
  ) {
    return false
  }
  if (bound.menu !== undefined && Option.isSome(bound.menu())) {
    return false
  }
  if (
    eventTarget !== null &&
    typeof HTMLElement !== 'undefined' &&
    eventTarget instanceof HTMLElement &&
    (eventTarget.isContentEditable ||
      eventTarget instanceof HTMLInputElement ||
      eventTarget instanceof HTMLTextAreaElement ||
      eventTarget instanceof HTMLSelectElement ||
      eventTarget.closest('.fk-overlay') !== null)
  ) {
    return false
  }
  const key = normalizeKey(input.key)
  if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Enter') {
    return false
  }
  return Option.match(
    frameOf({
      navigation: bound.navigation,
      viewAt: bound.viewAt,
    }),
    {
      onNone: () => false,
      onSome: frame => {
        if (Array.isReadonlyArrayNonEmpty(frame.overlays)) {
          return false
        }
        const layer = frame.base
        const grid = gridOfView(layer.view)
        const syncedFocus = bound.focus!()
        const maybeFocused = focusedTagOf(frame, syncedFocus)
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          const move: FocusMove = key === 'ArrowDown' ? 'Down' : 'Up'
          return Option.match(movedTag(grid, maybeFocused, move), {
            onNone: () => false,
            onSome: nextTarget => {
              bound.focusTarget!(layer.identity, nextTarget)
              return true
            },
          })
        }
        if (isInteractiveDomElement(eventTarget)) {
          return false
        }
        return Option.match(maybeFocused, {
          onNone: () => false,
          onSome: tag =>
            isLinkTag(tag)
              ? (bound.openUri?.(tag, Link()) ?? false)
              : (bound.press?.(tag) ?? false),
        })
      },
    },
  )
}

// PAINT

const keysLabelOf = (button: ButtonNode): string =>
  Array.match(button.keys ?? [], {
    onEmpty: () => button.label,
    onNonEmpty: keys => `${button.label} (${Array.join(keys, ' ')})`,
  })

const menuButtonsOf = (menu: ItemMenu): ReadonlyArray<ButtonNode> => [
  ...Array.map(menu.items, menuItem =>
    Button({
      label: menuItem.label,
      action: menuItem.action,
      ...(menuItem.icon === undefined ? {} : { icon: menuItem.icon }),
    }),
  ),
  Button({ label: 'Close', action: menu.dismissAction }),
]

const listWithoutMenu = (
  list: ListNode,
  items: ReadonlyArray<ListItem>,
): ListNode => ({
  _tag: 'List',
  label: list.label,
  items,
  ...(list.dropAction === undefined ? {} : { dropAction: list.dropAction }),
  ...(list.columns === undefined ? {} : { columns: list.columns }),
  ...(list.filter === undefined ? {} : { filter: list.filter }),
})

const decoratedButton = (
  button: ButtonNode,
  maybeFocused: Option.Option<string>,
  isShowingKeys: boolean,
): ButtonNode => ({
  ...button,
  label: isShowingKeys ? keysLabelOf(button) : button.label,
  ...(button.action !== undefined &&
  Option.contains(maybeFocused, button.action)
    ? { focused: true }
    : {}),
})

const decorated = (
  node: UiNode,
  maybeFocused: Option.Option<string>,
  isShowingKeys: boolean,
): UiNode =>
  M.value(node).pipe(
    M.withReturnType<UiNode>(),
    M.tagsExhaustive({
      Text: text => text,
      TextInput: input => input,
      Spacer: spacer => spacer,
      Button: button => decoratedButton(button, maybeFocused, isShowingKeys),
      Row: row => ({
        ...row,
        children: Array.map(row.children, child =>
          decorated(child, maybeFocused, isShowingKeys),
        ),
      }),
      Column: column => ({
        ...column,
        children: Array.map(column.children, child =>
          decorated(child, maybeFocused, isShowingKeys),
        ),
      }),
      Box: box => ({
        ...box,
        children: Array.map(box.children, child =>
          decorated(child, maybeFocused, isShowingKeys),
        ),
      }),
      Progress: progress => progress,
      List: list => {
        const decoratedItems = Array.map(list.items, item => ({
          ...item,
          ...(Option.exists(
            Option.fromNullishOr(item.action ?? item.href),
            tag => Option.contains(maybeFocused, tag),
          )
            ? { focused: true }
            : {}),
          ...(item.check?.action !== undefined &&
          Option.contains(maybeFocused, item.check.action)
            ? { check: { ...item.check, focused: true } }
            : {}),
          ...(item.trailing === undefined
            ? {}
            : {
                trailing: Array.map(item.trailing, button =>
                  decoratedButton(button, maybeFocused, isShowingKeys),
                ),
              }),
        }))
        if (list.menu === undefined) {
          return { ...list, items: decoratedItems }
        } else {
          const { menu } = list
          return Option.match(
            Array.findFirstIndex(decoratedItems, item => item.key === menu.key),
            {
              onNone: () => ({ ...list, items: decoratedItems }),
              onSome: menuIndex => {
                const before = Array.take(decoratedItems, menuIndex + 1)
                const after = Array.drop(decoratedItems, menuIndex + 1)
                const menuRow = Row(
                  { gap: 1 },
                  Text(' '),
                  ...Array.map(menuButtonsOf(menu), button =>
                    decoratedButton(button, maybeFocused, isShowingKeys),
                  ),
                )
                return Column(
                  { gap: 0 },
                  listWithoutMenu(list, before),
                  menuRow,
                  ...(Array.isReadonlyArrayNonEmpty(after)
                    ? [listWithoutMenu(list, after)]
                    : []),
                )
              },
            },
          )
        }
      },
      Seek: seek => seek,
      Transcript: transcript => transcript,
      DeviceShell: shell => ({
        ...shell,
        children: Array.map(shell.children, child =>
          decorated(child, maybeFocused, isShowingKeys),
        ),
      }),
      Lazy: lazy =>
        decorated(resolveLazyNode(lazy), maybeFocused, isShowingKeys),
    }),
  )

/**
 * The frame a terminal paints: the highlighted button marked `focused`,
 * and every button in a dialog or sheet labeled with its keys, so
 * "Delete Counter 2?" reads `[ Delete (y) ] [ Cancel (n) ]`.
 *
 * @example
 * ```typescript
 * terminalFrameOf(frame, { '/counters': 'Reset:2' })
 * // the Reset button of Counter 2 carries `focused: true`
 * ```
 */
export const terminalFrameOf = (frame: Frame, focus: TerminalFocus): Frame => {
  const keyboardIdentity = keyboardLayerOf(frame).identity
  const maybeFocused = focusedTagOf(frame, focus)
  const layerFor = (layer: FrameLayer): FrameLayer =>
    layer.view._tag === 'Screen'
      ? {
          ...layer,
          view: {
            _tag: 'Screen',
            node: decorated(
              layer.view.node,
              layer.identity === keyboardIdentity
                ? maybeFocused
                : Option.none(),
              isPresented(layer),
            ),
          },
        }
      : layer
  return {
    ...frame,
    base: layerFor(frame.base),
    overlays: Array.map(frame.overlays, layerFor),
  }
}
