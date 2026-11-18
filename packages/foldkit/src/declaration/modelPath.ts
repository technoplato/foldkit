// MODEL PATH

const segmentsKey: unique symbol = Symbol.for('foldkit/ModelPath')

/**
 * A typed reference to one part of a Model: a field, or a field inside
 * one. It is written as property access, `at.listening.placeMs`, so a
 * field that is renamed or removed breaks the build, and nothing is
 * matched by text.
 *
 * @example
 * ```typescript
 * const at = ModelPath.of(Model)
 * at.count // ModelPath<number>
 * ModelPath.segmentsOf(at.count) // ['count']
 * ```
 */
export type ModelPath<A> = Readonly<{
  [segmentsKey]: ReadonlyArray<string>
}> &
  (A extends ReadonlyArray<unknown>
    ? unknown
    : A extends object
      ? { readonly [Key in keyof A]-?: ModelPath<A[Key]> }
      : unknown)

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
