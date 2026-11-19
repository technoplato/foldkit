import { Equal } from 'effect'

// SHARED

const isPlain = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype

const sharedArray = (
  previous: ReadonlyArray<unknown>,
  next: ReadonlyArray<unknown>,
): ReadonlyArray<unknown> => {
  let isSame = previous.length === next.length
  const parts = next.map((part, index) => {
    const kept = shared(previous[index], part)
    if (kept !== previous[index]) {
      isSame = false
    }
    return kept
  })
  return isSame ? previous : parts
}

const sharedRecord = (
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const keys = Object.keys(next)
  let isSame = keys.length === Object.keys(previous).length
  const parts: Record<string, unknown> = {}
  for (const key of keys) {
    const kept = shared(previous[key], next[key])
    if (kept !== previous[key] || !(key in previous)) {
      isSame = false
    }
    parts[key] = kept
  }
  return isSame ? previous : parts
}

const shared = (previous: unknown, next: unknown): unknown => {
  if (Object.is(previous, next)) {
    return previous
  } else if (Array.isArray(previous) && Array.isArray(next)) {
    return sharedArray(previous, next)
  } else if (isPlain(previous) && isPlain(next)) {
    return sharedRecord(previous, next)
  } else if (
    typeof previous === 'object' &&
    previous !== null &&
    typeof next === 'object' &&
    next !== null &&
    !Array.isArray(next) &&
    !isPlain(next) &&
    Equal.equals(previous, next)
  ) {
    return previous
  } else {
    return next
  }
}

/**
 * The next tree, built out of the previous tree's own parts wherever a
 * part is equal: an equal list item, an equal field, an equal subtree
 * comes back as the object it was, and an equal tree comes back whole. A
 * Program's view is a new tree for every Model, mostly equal to the last;
 * a painter that keeps what it painted by part can then tell what changed
 * by asking whether a part is the same object, and repaint only that.
 * List items are compared place by place.
 *
 * @example
 * ```typescript
 * const kept = sharedWith(previousTree, nextTree)
 * kept.passages[0] === previousTree.passages[0] // true when that passage did not change
 * ```
 */
export const sharedWith = <Tree>(previous: unknown, next: Tree): Tree =>
  // NOTE: what comes back is `next` or built of parts equal to `next`'s.
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  shared(previous, next) as Tree
