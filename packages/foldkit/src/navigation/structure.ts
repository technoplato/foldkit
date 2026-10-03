import { Array, Equal, Match as M, Option, Schema as S, pipe } from 'effect'

import { ts } from '../schema/index.js'

// ANCHOR

/** Identifies the view element that a Popover presentation anchors to. */
export const ElementAnchor = S.brand('ElementAnchor')(S.NonEmptyString)
/** Identifies the view element that a Popover presentation anchors to. */
export type ElementAnchor = typeof ElementAnchor.Type

// STYLE

/** Slides the destination over the existing content from the trailing edge. */
export const Push = ts('Push')
/** Slides the destination over the existing content from the trailing edge. */
export type Push = typeof Push.Type

/** Presents the destination as a card that partially covers the content. */
export const Sheet = ts('Sheet')
/** Presents the destination as a card that partially covers the content. */
export type Sheet = typeof Sheet.Type

/** Presents the destination as a compact card docked to the bottom edge. */
export const BottomSheet = ts('BottomSheet')
/** Presents the destination as a compact card docked to the bottom edge. */
export type BottomSheet = typeof BottomSheet.Type

/** Covers the entire surface with the destination. */
export const FullScreenCover = ts('FullScreenCover')
/** Covers the entire surface with the destination. */
export type FullScreenCover = typeof FullScreenCover.Type

/** Centers the destination over dimmed content for a focused decision. */
export const Dialog = ts('Dialog')
/** Centers the destination over dimmed content for a focused decision. */
export type Dialog = typeof Dialog.Type

/** Points the destination at the anchored element without covering it. */
export const Popover = ts('Popover', {
  anchor: ElementAnchor,
})
/** Points the destination at the anchored element without covering it. */
export type Popover = typeof Popover.Type

/** The screen edge a drawer panel slides in from. */
export const Side = S.Literals(['Left', 'Right'])
/** The screen edge a drawer panel slides in from. */
export type Side = typeof Side.Type

/** Reveals the destination as a panel sliding in from one screen edge. */
export const Drawer = ts('Drawer', {
  from: Side,
})
/** Reveals the destination as a panel sliding in from one screen edge. */
export type Drawer = typeof Drawer.Type

/** How a presented destination overlays the content beneath it. */
export const PresentationStyle = S.Union([
  Push,
  Sheet,
  BottomSheet,
  FullScreenCover,
  Dialog,
  Popover,
  Drawer,
])
/** How a presented destination overlays the content beneath it. */
export type PresentationStyle = typeof PresentationStyle.Type

// ENTRY

/** One destination sitting above the root together with its presentation style. */
export type Presented<Destination> = Readonly<{
  destination: Destination
  style: PresentationStyle
}>

/** Builds an entry presenting `destination` with `style`. */
export const presented = <Destination>(
  destination: Destination,
  style: PresentationStyle,
): Presented<Destination> => ({
  destination,
  style,
})

// STACK

/**
 * Every style that presents a destination over the page beneath instead of
 * pushing a new page: a sheet, a dialog, a popover, a drawer, or a cover.
 */
export const ModalStyle = S.Union([
  Sheet,
  BottomSheet,
  FullScreenCover,
  Dialog,
  Popover,
  Drawer,
])
/** Every style that presents a destination over the page beneath. */
export type ModalStyle = typeof ModalStyle.Type

/** True for every style except Push. */
export const isModalStyle = (style: PresentationStyle): style is ModalStyle =>
  style._tag !== 'Push'

/** The one destination presented over the pages, with its modal style. */
export type Modal<Destination> = Readonly<{
  destination: Destination
  style: ModalStyle
}>

/**
 * A navigation stack: the root, the pages pushed on it in order, and at
 * most one modal over the topmost page. The shape itself rules out two
 * modals at once and a page pushed over a modal: neither has a value of
 * this type. `[Counter, Session page]` is two pages; `[Counter, menu]` is
 * a page with a Dialog over it.
 */
export type NavigationStack<Destination> = Readonly<{
  root: Destination
  pages: ReadonlyArray<Destination>
  maybeModal: Option.Option<Modal<Destination>>
}>

/** The Schema of a navigation stack over a Destination Schema. */
export const NavigationStack = <D extends S.Top>(Destination: D) =>
  S.Struct({
    root: Destination,
    pages: S.Array(Destination),
    maybeModal: S.Option(
      S.Struct({ destination: Destination, style: ModalStyle }),
    ),
  })

/** A stack showing only its root. */
export const stackAtRoot = <Destination>(
  root: Destination,
): NavigationStack<Destination> => ({
  root,
  pages: [],
  maybeModal: Option.none(),
})

/**
 * The stack a list of entries describes, root first. Pushed pages come
 * first; the first modal sits over them and ends the stack, since nothing
 * can be presented over a modal. `[Push Session, Dialog menu, Dialog menu]`
 * becomes the Session page with one menu over it.
 *
 * @example
 * ```typescript
 * stackFrom(Counter(), [presented(SessionSettings(), Push()), presented(ActionMenu(menu), Dialog())])
 * // { root: Counter, pages: [SessionSettings], maybeModal: Some(menu as a Dialog) }
 * ```
 */
export const stackFrom = <Destination>(
  root: Destination,
  entries: ReadonlyArray<Presented<Destination>>,
): NavigationStack<Destination> => {
  const maybeModalIndex = Array.findFirstIndex(entries, entry =>
    isModalStyle(entry.style),
  )
  const pageCount = Option.getOrElse(maybeModalIndex, () => entries.length)
  return {
    root,
    pages: Array.map(
      Array.take(entries, pageCount),
      entry => entry.destination,
    ),
    maybeModal: Option.flatMap(maybeModalIndex, index =>
      Option.flatMap(Array.get(entries, index), entry =>
        isModalStyle(entry.style)
          ? Option.some({ destination: entry.destination, style: entry.style })
          : Option.none(),
      ),
    ),
  }
}

/** The stack a non-empty list of entries describes; see {@link stackFrom}. */
export const stackWithEntries = <Destination>(
  root: Destination,
  entries: Array.NonEmptyReadonlyArray<Presented<Destination>>,
): NavigationStack<Destination> => stackFrom(root, entries)

/**
 * Every entry above the root, bottom first: the pages as Push entries,
 * then the modal.
 */
export const entriesOf = <Destination>(
  stack: NavigationStack<Destination>,
): ReadonlyArray<Presented<Destination>> => [
  ...Array.map(stack.pages, destination => presented(destination, Push())),
  ...Option.match(stack.maybeModal, {
    onNone: () => [],
    onSome: modal => [presented<Destination>(modal.destination, modal.style)],
  }),
]

/** True when a modal is presented, so no second modal can be. */
export const hasModal = <Destination>(
  stack: NavigationStack<Destination>,
): boolean => Option.isSome(stack.maybeModal)

/** The stack keeping only its first `count` entries above the root. */
export const truncated = <Destination>(
  stack: NavigationStack<Destination>,
  count: number,
): NavigationStack<Destination> =>
  stackFrom(stack.root, Array.take(entriesOf(stack), count))

/** True for a style that hides everything beneath it. */
export const isOpaque = (style: PresentationStyle): boolean =>
  style._tag === 'Push' || style._tag === 'FullScreenCover'

/** The topmost entry above the root: the modal, else the last page. */
export const topEntry = <Destination>(
  stack: NavigationStack<Destination>,
): Option.Option<Presented<Destination>> => Array.last(entriesOf(stack))

/**
 * Returns the stack with `entry` presented. A page goes on top of the
 * pages and beneath any modal, which stays on top. A modal goes over the
 * pages unless one is already presented: there is at most one, so the
 * stack comes back unchanged.
 *
 * @example
 * ```typescript
 * pushed(menuOverCounter, presented(SessionSettings(), Push()))
 * // { root: Counter, pages: [SessionSettings], maybeModal: Some(menu) }
 * pushed(menuOverCounter, presented(ConfirmDelete(), Dialog()))
 * // menuOverCounter, unchanged
 * ```
 */
export const pushed = <Destination>(
  stack: NavigationStack<Destination>,
  entry: Presented<Destination>,
): NavigationStack<Destination> => {
  if (!isModalStyle(entry.style)) {
    return { ...stack, pages: Array.append(stack.pages, entry.destination) }
  } else if (hasModal(stack)) {
    return stack
  } else {
    return {
      ...stack,
      maybeModal: Option.some({
        destination: entry.destination,
        style: entry.style,
      }),
    }
  }
}

/** Returns the stack with its topmost entry removed, or `Option.none` when
 *  only the bare root remains. */
export const popped = <Destination>(
  stack: NavigationStack<Destination>,
): Option.Option<NavigationStack<Destination>> =>
  Array.match(entriesOf(stack), {
    onEmpty: () => Option.none(),
    onNonEmpty: entries =>
      Option.some(stackFrom(stack.root, Array.initNonEmpty(entries))),
  })

/** Returns the stack with `nextRoot` beneath the unchanged entries. */
export const replacedRoot = <Destination>(
  stack: NavigationStack<Destination>,
  nextRoot: Destination,
): NavigationStack<Destination> => ({ ...stack, root: nextRoot })

// INSTRUCTION

/** The minimal change set that reshapes one NavigationStack into another. */
export type StackInstruction<Destination> =
  | Readonly<{ _tag: 'SetRoot'; root: Destination }>
  | Readonly<{
      _tag: 'Push'
      destination: Destination
      style: PresentationStyle
    }>
  | Readonly<{ _tag: 'Pop' }>
  | Readonly<{ _tag: 'ReplaceTop'; entry: Presented<Destination> }>

/** Builds the instruction replacing the root while keeping every entry. */
export const setRoot = <Destination>(
  root: Destination,
): StackInstruction<Destination> => ({
  _tag: 'SetRoot',
  root,
})

/** Builds the instruction presenting `destination` with `style` on top. */
export const push = <Destination>(
  destination: Destination,
  style: PresentationStyle,
): StackInstruction<Destination> => ({
  _tag: 'Push',
  destination,
  style,
})

/** Builds the instruction removing the topmost entry. */
export const pop = <Destination>(): StackInstruction<Destination> => ({
  _tag: 'Pop',
})

/** Builds the instruction swapping the topmost entry for `entry`. */
export const replaceTop = <Destination>(
  entry: Presented<Destination>,
): StackInstruction<Destination> => ({
  _tag: 'ReplaceTop',
  entry,
})

// DIFF

type ChangedSlot<Destination> = Readonly<{
  slot: number
  nextEntry: Presented<Destination>
}>

// NOTE: Array.makeBy normalizes its count to at least one element.
const slotsBelow = (count: number): ReadonlyArray<number> => {
  if (count > 0) {
    return Array.makeBy(count, slot => slot)
  }
  return []
}

const firstChange = <Destination>(
  previousEntries: ReadonlyArray<Presented<Destination>>,
  nextEntries: ReadonlyArray<Presented<Destination>>,
  overlapCount: number,
): Option.Option<ChangedSlot<Destination>> =>
  pipe(
    slotsBelow(overlapCount),
    Array.findFirst(
      slot =>
        !Equal.equals(
          Array.get(previousEntries, slot),
          Array.get(nextEntries, slot),
        ),
    ),
    Option.flatMap(slot =>
      Option.map(Array.get(nextEntries, slot), nextEntry => ({
        slot,
        nextEntry,
      })),
    ),
  )

// NOTE: Array.replicate normalizes its count to at least one element.
const popsUpTo = <Destination>(
  count: number,
): ReadonlyArray<StackInstruction<Destination>> => {
  if (count > 0) {
    return Array.replicate(pop<Destination>(), count)
  }
  return []
}

const pushedInstructions = <Destination>(
  entries: ReadonlyArray<Presented<Destination>>,
): ReadonlyArray<StackInstruction<Destination>> =>
  Array.map(entries, nextEntry => push(nextEntry.destination, nextEntry.style))

const diffEntries = <Destination>(
  previousEntries: ReadonlyArray<Presented<Destination>>,
  nextEntries: ReadonlyArray<Presented<Destination>>,
  overlapCount: number,
  maybeChange: Option.Option<ChangedSlot<Destination>>,
): ReadonlyArray<StackInstruction<Destination>> => {
  if (Option.isSome(maybeChange)) {
    const changedSlot = maybeChange.value
    return [
      ...popsUpTo<Destination>(previousEntries.length - changedSlot.slot - 1),
      replaceTop(changedSlot.nextEntry),
      ...pushedInstructions<Destination>(
        nextEntries.slice(changedSlot.slot + 1),
      ),
    ]
  }
  return [
    ...popsUpTo<Destination>(previousEntries.length - overlapCount),
    ...pushedInstructions<Destination>(nextEntries.slice(overlapCount)),
  ]
}

/** Computes the instructions turning `previous` into `next`: pops back to
 *  the deepest shared entry, replaces differing overlapped slots bottom-up,
 *  pushes new top entries, and rebases the root last. Equal stacks yield an
 *  empty array. */
export const stackInstructions = <Destination>(
  previous: NavigationStack<Destination>,
  next: NavigationStack<Destination>,
): ReadonlyArray<StackInstruction<Destination>> => {
  if (Equal.equals(previous, next)) {
    return []
  }
  const previousEntries = entriesOf(previous)
  const nextEntries = entriesOf(next)
  const overlapCount = Math.min(previousEntries.length, nextEntries.length)
  const maybeChange = firstChange(previousEntries, nextEntries, overlapCount)
  const entryInstructions = diffEntries(
    previousEntries,
    nextEntries,
    overlapCount,
    maybeChange,
  )
  if (!Equal.equals(previous.root, next.root)) {
    return [...entryInstructions, setRoot(next.root)]
  }
  return entryInstructions
}

// REDUCE

const popOrKeep = <Destination>(
  stack: NavigationStack<Destination>,
): NavigationStack<Destination> => {
  const maybePopped = popped(stack)
  if (Option.isSome(maybePopped)) {
    return maybePopped.value
  }
  return stack
}

const replaceTopOrKeep = <Destination>(
  stack: NavigationStack<Destination>,
  entry: Presented<Destination>,
): NavigationStack<Destination> =>
  Array.match(entriesOf(stack), {
    onEmpty: () => stack,
    onNonEmpty: entries =>
      stackFrom(stack.root, [...Array.initNonEmpty(entries), entry]),
  })

/** Applies `instructions` left to right to `stack`. A Pop on a bare root
 *  and a ReplaceTop with nothing presented leave the stack unchanged. */
export const applyStackInstructions = <Destination>(
  stack: NavigationStack<Destination>,
  instructions: ReadonlyArray<StackInstruction<Destination>>,
): NavigationStack<Destination> =>
  Array.reduce(instructions, stack, (current, instruction) =>
    M.value(instruction).pipe(
      M.withReturnType<NavigationStack<Destination>>(),
      M.tagsExhaustive({
        SetRoot: ({ root }) => replacedRoot(current, root),
        Push: ({ destination, style }) =>
          pushed(current, presented(destination, style)),
        Pop: () => popOrKeep(current),
        ReplaceTop: ({ entry }) => replaceTopOrKeep(current, entry),
      }),
    ),
  )
