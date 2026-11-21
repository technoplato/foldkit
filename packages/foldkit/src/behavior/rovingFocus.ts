import { Array, Match as M, Option, Predicate, Schema as S, pipe } from 'effect'

// NOTE: this is the one place that decides keyboard roving navigation over
// a list of items (menus, tabs, toolbars, radio groups, listboxes, trees).
// It keeps no state and reads no DOM: items are plain data addressed by
// index, and every Client calls the same pure functions.

// SCHEMA

/**
 * Which axis arrow keys move along: vertical (`ArrowDown` / `ArrowUp`),
 * horizontal (`ArrowRight` / `ArrowLeft`), or both.
 */
export const Orientation = S.Literals(['Vertical', 'Horizontal', 'Both'])
/** Which axis arrow keys move along. */
export type Orientation = typeof Orientation.Type

/**
 * Reading direction for horizontal arrow keys: in `Rtl`, `ArrowLeft` moves
 * forward and `ArrowRight` moves backward.
 */
export const Direction = S.Literals(['Ltr', 'Rtl'])
/** Reading direction for horizontal arrow keys. */
export type Direction = typeof Direction.Type

/** One roving focus movement across a list of items. */
export const Move = S.Literals(['Next', 'Previous', 'First', 'Last'])
/** One roving focus movement across a list of items. */
export type Move = typeof Move.Type

/** Step direction when scanning indices: `+1` forward, `-1` backward. */
export type StepDirection = 1 | -1

// PURE HELPERS

/**
 * Wraps `index` into `[0, length - 1]`, handling negative offsets cleanly.
 * Returns `0` when `length <= 0`.
 *
 * @example
 * ```typescript
 * wrapIndex(-1, 3) // 2
 * wrapIndex(3, 3) // 0
 * ```
 */
export const wrapIndex = (index: number, length: number): number =>
  length <= 0 ? 0 : ((index % length) + length) % length

/**
 * Maps a keyboard event `key` to a roving {@link Move} for the given
 * orientation and direction, or none when the key is not a roving key.
 *
 * - `Vertical` (default): `ArrowDown` -> `Next`, `ArrowUp` -> `Previous`.
 * - `Horizontal`: `ArrowRight` -> `Next` (`Ltr`) or `Previous` (`Rtl`);
 *   `ArrowLeft` -> `Previous` (`Ltr`) or `Next` (`Rtl`).
 * - `Both`: accepts both vertical and horizontal arrow keys.
 * - `Home` (and `PageUp` when `pageKeys` is true, the default) -> `First`.
 * - `End` (and `PageDown` when `pageKeys` is true, the default) -> `Last`.
 *
 * @example
 * ```typescript
 * moveOfKey('ArrowDown') // Some('Next')
 * moveOfKey('ArrowLeft', { orientation: 'Horizontal', direction: 'Rtl' }) // Some('Next')
 * moveOfKey('Escape') // None
 * ```
 */
export const moveOfKey = (
  key: string,
  options: Readonly<{
    orientation?: Orientation
    direction?: Direction
    pageKeys?: boolean
  }> = {},
): Option.Option<Move> => {
  const orientation = options.orientation ?? 'Vertical'
  const direction = options.direction ?? 'Ltr'
  const pageKeys = options.pageKeys ?? true
  const allowsVertical = orientation === 'Vertical' || orientation === 'Both'
  const allowsHorizontal =
    orientation === 'Horizontal' || orientation === 'Both'
  const forwardHorizontal = direction === 'Ltr' ? 'ArrowRight' : 'ArrowLeft'
  const backwardHorizontal = direction === 'Ltr' ? 'ArrowLeft' : 'ArrowRight'

  if (allowsVertical && key === 'ArrowDown') {
    return Option.some('Next')
  } else if (allowsVertical && key === 'ArrowUp') {
    return Option.some('Previous')
  } else if (allowsHorizontal && key === forwardHorizontal) {
    return Option.some('Next')
  } else if (allowsHorizontal && key === backwardHorizontal) {
    return Option.some('Previous')
  } else if (key === 'Home' || (pageKeys && key === 'PageUp')) {
    return Option.some('First')
  } else if (key === 'End' || (pageKeys && key === 'PageDown')) {
    return Option.some('Last')
  } else {
    return Option.none()
  }
}

/**
 * Scans `count` items starting at `startIndex` in `direction` (`1` forward,
 * `-1` backward), wrapping around once, and returns the first enabled
 * index, or none when `count <= 0` or every item is disabled.
 *
 * @example
 * ```typescript
 * findEnabledFrom(4, 1, 1, index => index === 1) // Some(2)
 * findEnabledFrom(3, 0, -1, () => false) // Some(0)
 * ```
 */
export const findEnabledFrom = (
  count: number,
  startIndex: number,
  direction: StepDirection,
  isDisabled: (index: number) => boolean = () => false,
): Option.Option<number> =>
  count <= 0
    ? Option.none()
    : pipe(
        count,
        Array.makeBy(step => wrapIndex(startIndex + step * direction, count)),
        Array.findFirst(Predicate.not(isDisabled)),
      )

/**
 * The first enabled item index in `0 .. count - 1`, or none when empty or
 * every item is disabled.
 *
 * @example
 * ```typescript
 * firstEnabled(3, index => index === 0) // Some(1)
 * firstEnabled(2, () => true) // None
 * ```
 */
export const firstEnabled = (
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): Option.Option<number> => findEnabledFrom(count, 0, 1, isDisabled)

/**
 * The last enabled item index in `0 .. count - 1`, or none when empty or
 * every item is disabled.
 *
 * @example
 * ```typescript
 * lastEnabled(3, index => index === 2) // Some(1)
 * lastEnabled(0) // None
 * ```
 */
export const lastEnabled = (
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): Option.Option<number> =>
  count <= 0 ? Option.none() : findEnabledFrom(count, count - 1, -1, isDisabled)

const findLinearEnabled = (
  count: number,
  startIndex: number,
  direction: StepDirection,
  isDisabled: (index: number) => boolean,
): Option.Option<number> => {
  for (
    let index = startIndex;
    index >= 0 && index < count;
    index += direction
  ) {
    if (!isDisabled(index)) {
      return Option.some(index)
    }
  }
  return Option.none()
}

const keepIfEnabled = (
  count: number,
  index: number,
  isDisabled: (index: number) => boolean,
): Option.Option<number> =>
  index >= 0 && index < count && !isDisabled(index)
    ? Option.some(index)
    : Option.none()

/**
 * Resolves the next enabled index for a roving {@link Move}.
 *
 * - `First` / `Last` jump to the first / last enabled item.
 * - `Next` from `None` lands on the first enabled item; `Previous` from
 *   `None` lands on the last enabled item.
 * - `loop` defaults to `true`, wrapping around from the last enabled item
 *   to the first and vice versa. When `loop` is `false`, moving past the
 *   edge keeps `current` if it is enabled.
 * - Returns `None` when `count <= 0` or every item is disabled.
 *
 * @example
 * ```typescript
 * stepEnabled({ count: 3, current: Option.some(2), move: 'Next' }) // Some(0)
 * stepEnabled({ count: 3, current: Option.some(2), move: 'Next', loop: false }) // Some(2)
 * stepEnabled({ count: 3, current: Option.some(0), move: 'Next', isDisabled: i => i === 1 }) // Some(2)
 * ```
 */
export const stepEnabled = (
  input: Readonly<{
    count: number
    current: Option.Option<number>
    move: Move
    isDisabled?: (index: number) => boolean
    loop?: boolean
  }>,
): Option.Option<number> => {
  const { count, current, move } = input
  const isDisabled = input.isDisabled ?? (() => false)
  const loop = input.loop ?? true

  if (count <= 0) {
    return Option.none()
  }

  return M.value(move).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.when('First', () => firstEnabled(count, isDisabled)),
    M.when('Last', () => lastEnabled(count, isDisabled)),
    M.when('Next', () =>
      Option.match(current, {
        onNone: () => firstEnabled(count, isDisabled),
        onSome: index =>
          loop
            ? findEnabledFrom(count, index + 1, 1, isDisabled)
            : Option.orElse(
                findLinearEnabled(count, index + 1, 1, isDisabled),
                () => keepIfEnabled(count, index, isDisabled),
              ),
      }),
    ),
    M.when('Previous', () =>
      Option.match(current, {
        onNone: () => lastEnabled(count, isDisabled),
        onSome: index =>
          loop
            ? findEnabledFrom(count, index - 1, -1, isDisabled)
            : Option.orElse(
                findLinearEnabled(count, index - 1, -1, isDisabled),
                () => keepIfEnabled(count, index, isDisabled),
              ),
      }),
    ),
    M.exhaustive,
  )
}

/**
 * Maps `key` to a {@link Move} and resolves the next enabled index in one
 * step. Returns `None` when `key` is not a roving key or no enabled item
 * exists.
 *
 * @example
 * ```typescript
 * resolveKey({ key: 'ArrowDown', count: 3, current: Option.some(0) }) // Some(1)
 * resolveKey({ key: 'ArrowRight', count: 3, current: Option.some(0), orientation: 'Horizontal' }) // Some(1)
 * resolveKey({ key: 'Enter', count: 3, current: Option.some(0) }) // None
 * ```
 */
export const resolveKey = (
  input: Readonly<{
    key: string
    count: number
    current: Option.Option<number>
    isDisabled?: (index: number) => boolean
    orientation?: Orientation
    direction?: Direction
    loop?: boolean
    pageKeys?: boolean
  }>,
): Option.Option<number> =>
  Option.flatMap(
    moveOfKey(input.key, {
      ...(input.orientation === undefined
        ? {}
        : { orientation: input.orientation }),
      ...(input.direction === undefined ? {} : { direction: input.direction }),
      ...(input.pageKeys === undefined ? {} : { pageKeys: input.pageKeys }),
    }),
    move =>
      stepEnabled({
        count: input.count,
        current: input.current,
        move,
        ...(input.isDisabled === undefined
          ? {}
          : { isDisabled: input.isDisabled }),
        ...(input.loop === undefined ? {} : { loop: input.loop }),
      }),
  )
