import {
  Array,
  HashSet,
  Option,
  Predicate,
  Record,
  String as String_,
  pipe,
} from 'effect'

/** Paths changed and affected between two Models. */
export type DiffResult = Readonly<{
  changedPaths: HashSet.HashSet<string>
  affectedPaths: HashSet.HashSet<string>
}>

/** An empty Model diff. */
export const emptyDiff: DiffResult = {
  changedPaths: HashSet.empty(),
  affectedPaths: HashSet.empty(),
}

const isExpandable = Predicate.isObjectOrArray

/** Computes the changed and affected paths between two Models. */
export const computeDiff = (
  previous: unknown,
  current: unknown,
): DiffResult => {
  const changedPaths = new Set<string>()

  const walk = (
    previousValue: unknown,
    nextValue: unknown,
    path: string,
  ): void => {
    if (previousValue === nextValue) {
      return
    }

    if (!isExpandable(nextValue) || !isExpandable(previousValue)) {
      changedPaths.add(path)
      return
    }

    if (Array.isArray(nextValue) && Array.isArray(previousValue)) {
      walkArray(previousValue, nextValue, path)
    } else if (
      Predicate.isObject(nextValue) &&
      Predicate.isObject(previousValue)
    ) {
      walkObject(previousValue, nextValue, path)
    } else {
      changedPaths.add(path)
    }
  }

  const walkObject = (
    previousValue: Readonly<Record<string, unknown>>,
    nextValue: Readonly<Record<string, unknown>>,
    path: string,
  ): void => {
    pipe(
      nextValue,
      Record.keys,
      Array.forEach(key => {
        const childPath = `${path}.${key}`
        const maybePreviousChild = Record.get(previousValue, key)
        const maybeNextChild = Record.get(nextValue, key)
        if (
          Option.isSome(maybePreviousChild) &&
          Option.isSome(maybeNextChild)
        ) {
          walk(maybePreviousChild.value, maybeNextChild.value, childPath)
        } else {
          changedPaths.add(childPath)
        }
      }),
    )
    pipe(
      previousValue,
      Record.keys,
      Array.forEach(key => {
        if (!Record.has(nextValue, key)) {
          changedPaths.add(`${path}.${key}`)
        }
      }),
    )
  }

  const walkArray = (
    previousValue: ReadonlyArray<unknown>,
    nextValue: ReadonlyArray<unknown>,
    path: string,
  ): void => {
    pipe(
      nextValue,
      Array.forEach((item, index) => {
        const childPath = `${path}.${index}`
        const maybePreviousItem = Array.get(previousValue, index)
        if (Option.isSome(maybePreviousItem)) {
          walk(maybePreviousItem.value, item, childPath)
        } else {
          changedPaths.add(childPath)
        }
      }),
    )
    if (previousValue.length > nextValue.length) {
      pipe(
        Array.range(nextValue.length, previousValue.length - 1),
        Array.forEach(index => changedPaths.add(`${path}.${index}`)),
      )
    }
  }

  walk(previous, current, 'root')

  const affectedPaths = new Set(changedPaths)
  const addAncestors = (path: string): void => {
    pipe(
      path,
      String_.lastIndexOf('.'),
      Option.map(lastDot => path.substring(0, lastDot)),
      Option.filter(parent => !affectedPaths.has(parent)),
      Option.map(parent => {
        affectedPaths.add(parent)
        addAncestors(parent)
      }),
    )
  }
  changedPaths.forEach(addAncestors)

  return {
    changedPaths: HashSet.fromIterable(changedPaths),
    affectedPaths: HashSet.fromIterable(affectedPaths),
  }
}
