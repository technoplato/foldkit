import { Equal, Option } from 'effect'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import type { AnyBound } from './interaction.js'

// SELECTION

type Selected<Snapshot, Selection> = Readonly<{
  snapshot: Snapshot
  selection: Selection
}>

/**
 * Reads a selection of an external store and keeps its reference while
 * the selection is equal, so a component re-renders only when what it
 * reads changes.
 */
export const useSelected = <Snapshot, Selection>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => Snapshot,
  select: (snapshot: Snapshot) => Selection,
  isEqual: (self: Selection, that: Selection) => boolean,
): Selection => {
  const committed = useRef<Option.Option<Selection>>(Option.none())
  const getSelection = useMemo(() => {
    let maybeSelected: Option.Option<Selected<Snapshot, Selection>> =
      Option.none()
    return (): Selection => {
      const snapshot = getSnapshot()
      if (
        Option.isSome(maybeSelected) &&
        Object.is(maybeSelected.value.snapshot, snapshot)
      ) {
        return maybeSelected.value.selection
      }
      const next = select(snapshot)
      const maybePrevious = Option.isSome(maybeSelected)
        ? Option.some(maybeSelected.value.selection)
        : committed.current
      const selection =
        Option.isSome(maybePrevious) && isEqual(maybePrevious.value, next)
          ? maybePrevious.value
          : next
      maybeSelected = Option.some({ snapshot, selection })
      return selection
    }
  }, [getSnapshot, select, isEqual])
  const selection = useSyncExternalStore(subscribe, getSelection, getSelection)
  useEffect(() => {
    committed.current = Option.some(selection)
  }, [selection])
  return selection
}

/** Reads one value of a bound Program, kept while structurally equal. */
export const useBoundRead = <Value>(
  bound: AnyBound,
  read: () => Value,
): Value => useSelected(bound.subscribe, bound.readModel, read, Equal.equals)
