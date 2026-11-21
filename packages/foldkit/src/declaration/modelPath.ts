import type { Option } from 'effect'

// MODEL PATH

const segmentsKey: unique symbol = Symbol.for('foldkit/ModelPath')

const valueTypeKey: unique symbol = Symbol.for('foldkit/ModelPathValue')

/**
 * A typed reference to one part of a Model: a field, or a field inside
 * one. It is written as property access, `at.listening.placeMs`, so a
 * field that is renamed or removed breaks the build, and nothing is
 * matched by text. An Option and a list are looked through: a field
 * after one is that field of what the Option holds, or of every row, so
 * `at.maybeCounter.count` and `at.counters.count` are both `count`. A
 * state that is one of several offers the fields of each, so
 * `at.maybeSearch.selected` names a field only a found search has.
 *
 * @example
 * ```typescript
 * const at = ModelPath.of(Model)
 * at.count // ModelPath<number>
 * ModelPath.segmentsOf(at.count) // ['count']
 * ModelPath.segmentsOf(at.maybeCounter.count) // ['maybeCounter', 'count']
 * ```
 */
export type ModelPath<A> = Readonly<{
  [segmentsKey]: ReadonlyArray<string>
  [valueTypeKey]?: () => A
}> &
  Inside<A>

type Inside<A> = [A] extends [Option.Option<infer Held>]
  ? Inside<Held>
  : [A] extends [ReadonlyArray<infer Row>]
    ? Inside<Row>
    : [A] extends [object]
      ? { readonly [Key in KeyOf<A>]-?: ModelPath<ValueAt<A, Key>> }
      : unknown

type KeyOf<A> = A extends unknown ? keyof A : never

type ValueAt<A, Key> = A extends unknown
  ? Key extends keyof A
    ? A[Key]
    : never
  : never

const pathAt = (segments: ReadonlyArray<string>): unknown =>
  new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === segmentsKey) {
          return segments
        } else if (typeof property === 'string') {
          return pathAt([...segments, property])
        } else {
          return undefined
        }
      },
    },
  )

/**
 * The typed paths of a Model, from its Schema. Read a field off it to
 * name that field: `ModelPath.of(Model).count`.
 *
 * @example
 * ```typescript
 * const at = ModelPath.of(Model)
 * const Increment = Catalog.action('Increment', { mutates: [at.count], … })
 * ```
 */
export const of = <A>(_model: Readonly<{ Type: A }>): ModelPath<A> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  pathAt([]) as ModelPath<A>

/**
 * The names a path goes through, outermost first.
 *
 * @example
 * ```typescript
 * ModelPath.segmentsOf(at.listening.placeMs) // ['listening', 'placeMs']
 * ```
 */
export const segmentsOf = (path: ModelPath<unknown>): ReadonlyArray<string> =>
  path[segmentsKey]
