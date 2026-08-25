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

/** The stack state where only the bare root is visible. */
export type NothingPresented = Readonly<{ _tag: 'NothingPresented' }>

/** Builds the bare-root presentation state. */
export const NothingPresented = (): NothingPresented => ({
  _tag: 'NothingPresented',
})

/** The stack state holding one or more presented entries above the root. */
export type PresentingEntries<Destination> = Readonly<{
  _tag: 'PresentingEntries'
  entries: Array.NonEmptyReadonlyArray<Presented<Destination>>
}>

/** Builds a presentation state from one or more entries. */
export const PresentingEntries = <Destination>(
  entries: Array.NonEmptyReadonlyArray<Presented<Destination>>,
): PresentingEntries<Destination> => ({
  _tag: 'PresentingEntries',
  entries,
})

/** A navigation stack of presented destinations over a persistent root.
 *  The root stays mounted beneath every entry; popping the last entry
 *  reveals it again. */
export type NavigationStack<Destination> = Readonly<{
  root: Destination
  presented: NothingPresented | PresentingEntries<Destination>
}>

/** Builds a stack showing only its bare root. */
export const stackAtRoot = <Destination>(
  root: Destination,
): NavigationStack<Destination> => ({
  root,
  presented: NothingPresented(),
})

/** Builds a stack showing its root beneath the given entries. */
export const stackWithEntries = <Destination>(
  root: Destination,
  entries: Array.NonEmptyReadonlyArray<Presented<Destination>>,
): NavigationStack<Destination> => ({
  root,
  presented: PresentingEntries(entries),
})

const presentedEntries = <Destination>(
  stack: NavigationStack<Destination>,
): ReadonlyArray<Presented<Destination>> =>
  M.value(stack.presented).pipe(
    M.withReturnType<ReadonlyArray<Presented<Destination>>>(),
    M.tagsExhaustive({
      NothingPresented: () => Array.empty(),
      PresentingEntries: ({ entries }) => entries,
    }),
  )

/** Returns the topmost entry, or `Option.none` for a bare-root stack. */
export const topEntry = <Destination>(
  stack: NavigationStack<Destination>,
): Option.Option<Presented<Destination>> =>
  M.value(stack.presented).pipe(
    M.withReturnType<Option.Option<Presented<Destination>>>(),
    M.tagsExhaustive({
      NothingPresented: () => Option.none(),
      PresentingEntries: ({ entries }) => Array.last(entries),
    }),
  )

/** Returns the stack with `entry` presented above everything else. */
export const pushed = <Destination>(
  stack: NavigationStack<Destination>,
  entry: Presented<Destination>,
): NavigationStack<Destination> =>
  M.value(stack.presented).pipe(
    M.withReturnType<NavigationStack<Destination>>(),
    M.tagsExhaustive({
      NothingPresented: () => stackWithEntries(stack.root, Array.make(entry)),
      PresentingEntries: ({ entries }) =>
        stackWithEntries(stack.root, Array.append(entries, entry)),
    }),
  )

const remainingAfterPop = <Destination>(
  entries: Array.NonEmptyReadonlyArray<Presented<Destination>>,
): Option.Option<Array.NonEmptyReadonlyArray<Presented<Destination>>> => {
  const withoutLast = Array.initNonEmpty(entries)
  if (Array.isReadonlyArrayNonEmpty(withoutLast)) {
    return Option.some(withoutLast)
  }
  return Option.none()
}

/** Returns the stack with its topmost entry removed, or `Option.none` when
 *  only the bare root remains. */
export const popped = <Destination>(
  stack: NavigationStack<Destination>,
): Option.Option<NavigationStack<Destination>> =>
  M.value(stack.presented).pipe(
    M.withReturnType<Option.Option<NavigationStack<Destination>>>(),
    M.tagsExhaustive({
      NothingPresented: () => Option.none(),
      PresentingEntries: ({ entries }) => {
        const maybeRemaining = remainingAfterPop(entries)
        if (Option.isSome(maybeRemaining)) {
          return Option.some(stackWithEntries(stack.root, maybeRemaining.value))
        }
        return Option.some(stackAtRoot(stack.root))
      },
    }),
  )

/** Returns the stack with `nextRoot` beneath the unchanged entries. */
export const replacedRoot = <Destination>(
  stack: NavigationStack<Destination>,
  nextRoot: Destination,
): NavigationStack<Destination> => ({
  root: nextRoot,
  presented: stack.presented,
})

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
  const previousEntries = presentedEntries(previous)
  const nextEntries = presentedEntries(next)
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
  M.value(stack.presented).pipe(
    M.withReturnType<NavigationStack<Destination>>(),
    M.tagsExhaustive({
      NothingPresented: () => stack,
      PresentingEntries: ({ entries }) =>
        stackWithEntries(
          stack.root,
          Array.append(Array.initNonEmpty(entries), entry),
        ),
    }),
  )

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
