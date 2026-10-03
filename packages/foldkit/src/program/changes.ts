import { Array, Option, Result, Schema as S, pipe } from 'effect'

import type { ProgramSchema } from './program.js'

// CHANGES

type Leaf = Readonly<{ path: string; text: string }>

const absent = '·'

const childPath = (path: string, key: string): string =>
  path === '' ? key : `${path}.${key}`

const leavesOf = (value: unknown, path: string): ReadonlyArray<Leaf> => {
  if (globalThis.Array.isArray(value)) {
    return Array.match(value, {
      onEmpty: () => [{ path, text: '[]' }],
      onNonEmpty: items =>
        Array.flatMap(items, (item, index) =>
          leavesOf(item, `${path}[${index.toString()}]`),
        ),
    })
  } else if (typeof value === 'object' && value !== null) {
    return Array.match(Object.entries(value), {
      onEmpty: () => [{ path, text: '{}' }],
      onNonEmpty: entries =>
        Array.flatMap(entries, ([key, child]) =>
          leavesOf(child, childPath(path, key)),
        ),
    })
  } else {
    return [{ path, text: JSON.stringify(value) }]
  }
}

const encodedLeaves = <Model>(
  Model: ProgramSchema<Model>,
  model: Model,
): ReadonlyArray<Leaf> =>
  pipe(
    Result.try(() => S.encodeSync(S.toCodecJson(Model))(model)),
    Result.match({
      onFailure: () => [],
      onSuccess: encoded => leavesOf(encoded, ''),
    }),
  )

const textAt = (
  leaves: ReadonlyArray<Leaf>,
  path: string,
): Option.Option<string> =>
  Option.map(
    Array.findFirst(leaves, leaf => leaf.path === path),
    leaf => leaf.text,
  )

/**
 * The fields one Message moved, read from the Model's own Schema, the way
 * TCA's `_printChanges` reads a reducer: one line per changed leaf, its
 * path, then before and after as JSON. A leaf only one side has shows `·`
 * on the other. It names no field itself, so it works for any Program.
 *
 * @example
 * ```typescript
 * modelChangeLines(App.Model, { count: 0, ... }, { count: 1, ... })
 * // ['  count  0 → 1']
 * modelChangeLines(App.Model, closedMenu, openMenu)
 * // ['  navigation.maybeModal  … → …', ...]
 * ```
 */
export const modelChangeLines = <Model>(
  Model: ProgramSchema<Model>,
  before: Model,
  after: Model,
): ReadonlyArray<string> => {
  const beforeLeaves = encodedLeaves(Model, before)
  const afterLeaves = encodedLeaves(Model, after)
  const paths = Array.dedupe([
    ...Array.map(beforeLeaves, leaf => leaf.path),
    ...Array.map(afterLeaves, leaf => leaf.path),
  ])
  return Array.getSomes(
    Array.map(paths, path => {
      const beforeText = Option.getOrElse(
        textAt(beforeLeaves, path),
        () => absent,
      )
      const afterText = Option.getOrElse(
        textAt(afterLeaves, path),
        () => absent,
      )
      return beforeText === afterText
        ? Option.none()
        : Option.some(`  ${path}  ${beforeText} → ${afterText}`)
    }),
  )
}
