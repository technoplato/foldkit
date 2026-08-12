import { Schema as S, Types } from 'effect'

/** A `TaggedStruct` schema that can be called directly as a constructor: `Foo({ count: 1 })` instead of `Foo.make({ count: 1 })`. */
export type CallableTaggedStruct<
  Tag extends string,
  Fields extends S.Struct.Fields,
> = S.TaggedStruct<Tag, Fields> &
  (keyof Fields extends never
    ? (
        value?: Parameters<S.TaggedStruct<Tag, Fields>['make']>[0] | void,
      ) => Types.Simplify<S.Struct.Type<{ readonly _tag: S.tag<Tag> } & Fields>>
    : (
        value: Parameters<S.TaggedStruct<Tag, Fields>['make']>[0],
      ) => Types.Simplify<
        S.Struct.Type<{ readonly _tag: S.tag<Tag> } & Fields>
      >)

/**
 * Co-located what/why documentation for a message constructor.
 * Hangs on the constructor/schema (`Message.doc`), never on wire values.
 */
export type MessageDoc = {
  readonly what: string
  readonly why: string
}

/** A callable tagged struct that exposes co-located {@link MessageDoc}. */
export type CallableTaggedStructWithDoc<
  Tag extends string,
  Fields extends S.Struct.Fields,
> = CallableTaggedStruct<Tag, Fields> & {
  readonly doc: MessageDoc
}

/** Options bag for `m` / `md` when co-locating docs (optional `fields`). */
export type MessageDocOptions<
  Fields extends S.Struct.Fields = {},
> = MessageDoc & {
  readonly fields?: Fields
}

const isMessageDocOptions = (
  value: unknown,
): value is MessageDocOptions<S.Struct.Fields> => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('what' in value) || !('why' in value)) {
    return false
  }
  // Detect by string-valued what/why so legacy field schemas
  // (`m('Tag', { count: S.Number })`) are never misread as docs — and so a
  // hypothetical `m('Tag', { what: S.String, why: S.String })` stays fields.
  return (
    typeof (value as { what: unknown }).what === 'string' &&
    typeof (value as { why: unknown }).why === 'string'
  )
}

const makeCallable = <Tag extends string, Fields extends S.Struct.Fields>(
  schema: S.TaggedStruct<Tag, Fields>,
  doc?: MessageDoc,
): CallableTaggedStruct<Tag, Fields> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  new Proxy(function () {} as unknown as object, {
    apply(_target, _thisArg, argumentsList) {
      return schema.make(argumentsList[0] ?? {})
    },
    get(_target, property, receiver) {
      // Doc hangs on the Proxy only — never mutates the Effect Schema object
      // (identity / annotations / JSON-schema export stay pristine).
      if (property === 'doc' && doc !== undefined) {
        return doc
      }
      return Reflect.get(schema, property, receiver)
    },
    has(_target, property) {
      if (property === 'doc' && doc !== undefined) {
        return true
      }
      return Reflect.has(schema, property)
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(schema)
    },
  }) as unknown as CallableTaggedStruct<Tag, Fields>

/**
 * Wraps `Schema.TaggedStruct` to create a message variant you can call directly as a constructor.
 * Use `m` for message types — enabling `ClickedReset()` instead of `ClickedReset.make()`.
 *
 * Optional `what` / `why` docs hang on the constructor (`.doc`), never on wire values.
 * Detected by string-valued `what` + `why` keys so legacy field bags still work.
 *
 * @example
 * ```typescript
 * const ClickedReset = m('ClickedReset')
 * ClickedReset() // { _tag: 'ClickedReset' }
 *
 * const ChangedCount = m('ChangedCount', { count: S.Number })
 * ChangedCount({ count: 1 }) // { _tag: 'ChangedCount', count: 1 }
 *
 * const RequestedIncrement = m('RequestedIncrement', {
 *   what: 'User asked to increment the counter',
 *   why: 'Primary write path from the + button',
 * })
 * RequestedIncrement() // { _tag: 'RequestedIncrement' } — wire stays pure
 * RequestedIncrement.doc // { what, why }
 *
 * const LoadedCounter = m('LoadedCounter', {
 *   fields: { maybeCounter: S.Option(S.Number) },
 *   what: 'Persisted counter loaded',
 *   why: 'Hydrate model after boot',
 * })
 * ```
 */
export function m<Tag extends string>(tag: Tag): CallableTaggedStruct<Tag, {}>
export function m<Tag extends string>(
  tag: Tag,
  options: MessageDoc,
): CallableTaggedStructWithDoc<Tag, {}>
export function m<Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  options: MessageDoc & { readonly fields: Fields },
): CallableTaggedStructWithDoc<Tag, Fields>
export function m<Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fields: Fields,
): CallableTaggedStruct<Tag, Fields>
export function m(
  tag: string,
  fieldsOrOptions: S.Struct.Fields | MessageDocOptions = {},
): any {
  if (isMessageDocOptions(fieldsOrOptions)) {
    const fields = fieldsOrOptions.fields ?? {}
    const doc: MessageDoc = {
      what: fieldsOrOptions.what,
      why: fieldsOrOptions.why,
    }
    return makeCallable(S.TaggedStruct(tag, fields as S.Struct.Fields), doc)
  }
  return makeCallable(
    S.TaggedStruct(tag, fieldsOrOptions as S.Struct.Fields),
  )
}

/**
 * Like {@link m}, but `what` / `why` docs are required.
 * Prefer when every message in a module must carry co-located documentation.
 *
 * @example
 * ```typescript
 * const RequestedIncrement = md('RequestedIncrement', {
 *   what: 'User asked to increment the counter',
 *   why: 'Primary write path from the + button',
 * })
 * RequestedIncrement.doc.what
 * ```
 */
export function md<Tag extends string>(
  tag: Tag,
  options: MessageDoc,
): CallableTaggedStructWithDoc<Tag, {}>
export function md<Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  options: MessageDoc & { readonly fields: Fields },
): CallableTaggedStructWithDoc<Tag, Fields>
export function md(
  tag: string,
  options: MessageDocOptions,
): any {
  const fields = options.fields ?? {}
  const doc: MessageDoc = { what: options.what, why: options.why }
  return makeCallable(S.TaggedStruct(tag, fields as S.Struct.Fields), doc)
}

/**
 * Wraps `Schema.TaggedStruct` to create a route variant you can call directly as a constructor.
 * Use `r` for route types — enabling `Home()` instead of `Home.make()`.
 *
 * @example
 * ```typescript
 * const Home = r('Home')
 * Home() // { _tag: 'Home' }
 *
 * const UserProfile = r('UserProfile', { id: S.String })
 * UserProfile({ id: 'abc' }) // { _tag: 'UserProfile', id: 'abc' }
 * ```
 */
export function r<Tag extends string>(tag: Tag): CallableTaggedStruct<Tag, {}>
export function r<Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fields: Fields,
): CallableTaggedStruct<Tag, Fields>
export function r(tag: string, fields: S.Struct.Fields = {}): any {
  return makeCallable(S.TaggedStruct(tag, fields))
}

/**
 * Wraps `Schema.TaggedStruct` to create a callable tagged struct you can call directly as a constructor.
 * Use `ts` for non-message, non-route tagged structs — enabling `Loading()`
 * instead of `Loading.make()`.
 *
 * @example
 * ```typescript
 * const Loading = ts('Loading')
 * Loading() // { _tag: 'Loading' }
 *
 * const Ok = ts('Ok', { data: S.String })
 * Ok({ data: 'hello' }) // { _tag: 'Ok', data: 'hello' }
 * ```
 */
export function ts<Tag extends string>(tag: Tag): CallableTaggedStruct<Tag, {}>
export function ts<Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fields: Fields,
): CallableTaggedStruct<Tag, Fields>
export function ts(tag: string, fields: S.Struct.Fields = {}): any {
  return makeCallable(S.TaggedStruct(tag, fields))
}
