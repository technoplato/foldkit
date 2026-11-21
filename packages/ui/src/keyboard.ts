import { Match as M, Option } from 'effect'
import { RovingFocus, Typeahead } from 'foldkit/behavior'

/** Whether a keyboard event key is a single printable character (not a named key like "Enter" or "ArrowDown"). */
export const isPrintableKey = (key: string): boolean =>
  Typeahead.isPrintableKey(key)

export const wrapIndex = (index: number, length: number): number =>
  RovingFocus.wrapIndex(index, length)

export const findFirstEnabledIndex =
  (
    itemCount: number,
    focusedIndex: number,
    isDisabled: (index: number) => boolean,
  ) =>
  (startIndex: number, direction: 1 | -1): number =>
    Option.getOrElse(
      RovingFocus.findEnabledFrom(itemCount, startIndex, direction, isDisabled),
      () => focusedIndex,
    )

export const keyToIndex = (
  nextKey: string,
  previousKey: string,
  itemCount: number,
  focusedIndex: number,
  isDisabled: (index: number) => boolean,
): ((key: string) => number) => {
  const moveFor = (key: string): Option.Option<RovingFocus.Move> =>
    M.value(key).pipe(
      M.withReturnType<Option.Option<RovingFocus.Move>>(),
      M.when(nextKey, () => Option.some('Next')),
      M.when(previousKey, () => Option.some('Previous')),
      M.whenOr('Home', 'PageUp', () => Option.some('First')),
      M.whenOr('End', 'PageDown', () => Option.some('Last')),
      M.orElse(() => Option.none()),
    )

  return (key: string): number =>
    Option.getOrElse(
      Option.flatMap(moveFor(key), move =>
        RovingFocus.stepEnabled({
          count: itemCount,
          current: Option.some(focusedIndex),
          move,
          isDisabled,
          loop: true,
        }),
      ),
      () => focusedIndex,
    )
}
