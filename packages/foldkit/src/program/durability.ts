import {
  Array,
  Data,
  Equal,
  Option,
  Predicate,
  Record,
  Schema as S,
  SchemaAST,
  type Types,
} from 'effect'

import { type CallableTaggedStruct, callableWith } from '../schema/index.js'

// KEYS

/** SchemaAST `context.annotations` key storing per-field durability metadata. */
export const durabilityKey = 'foldkitDurability'

/** SchemaAST `annotations` key marking a struct built with `Program.model` or `Program.taggedModel`. */
export const durabilityModelKey = 'foldkitDurabilityModel'

/** The four durability roles a Model field may declare. */
export type DurabilityRole = 'Synced' | 'Local' | 'Loaded' | 'Ephemeral'

/** Runtime durability metadata stored on a field's `ast.context.annotations`. */
export type FieldDurability =
  | Readonly<{ role: 'Synced' }>
  | Readonly<{ role: 'Local'; reset?: () => unknown }>
  | Readonly<{ role: 'Loaded'; reset: () => unknown }>
  | Readonly<{ role: 'Ephemeral'; reset: () => unknown }>

/** Runtime struct-level metadata stored on a `DurabilityModel`'s `ast.annotations`. */
export type ModelDurabilityMeta = Readonly<{
  isClassified: true
  key?: string
}>

/**
 * Thrown at runtime if an untyped caller attempts to write a `Synced`, `Local`,
 * union-variant, or unknown field through `applySubscriptionPatch`.
 *
 * @example
 * ```typescript
 * applySubscriptionPatch(Model.ast, current, { speed: 2 }) // throws ForbiddenSubscriptionWriteError
 * ```
 */
export class ForbiddenSubscriptionWriteError extends Data.TaggedError(
  'ForbiddenSubscriptionWriteError',
)<{
  readonly path: string
  readonly role: string
}> {}

// FIELD WRAPPERS

/** Phantom brand key carried on `LocalField`. */
export type LocalFieldTypeId = '~foldkit/LocalField'
/** Phantom brand key carried on `LoadedField`. */
export type LoadedFieldTypeId = '~foldkit/LoadedField'
/** Phantom brand key carried on `EphemeralField`. */
export type EphemeralFieldTypeId = '~foldkit/EphemeralField'
/** Phantom brand key carried on every `DurabilityModel` and `DurabilityTaggedModel`. */
export type DurabilityTypeId = '~foldkit/DurabilityModel'
/** Phantom brand key carried on every `DurabilityTaggedModel` variant. */
export type DurabilityTagTypeId = '~foldkit/DurabilityTag'

type ResetValueOf<Schema extends S.Top, Type> =
  Schema extends Readonly<{ readonly '~type.optional': 'optional' }>
    ? Type | undefined
    : Type

/** A `local` field paired with an explicit reset thunk for shared snapshots and variant hydration. */
export interface LocalField<Schema extends S.Top> {
  readonly '~foldkit/LocalField': LocalFieldTypeId
  readonly schema: Schema
  readonly reset: () => ResetValueOf<Schema, Schema['Type']>
}

/** A `loaded` field paired with the reset thunk used when stripping snapshots. */
export interface LoadedField<Schema extends S.Top> {
  readonly '~foldkit/LoadedField': LoadedFieldTypeId
  readonly schema: Schema
  readonly reset: () => ResetValueOf<Schema, Schema['Type']>
}

/** An `ephemeral` field paired with the reset thunk used when stripping snapshots. */
export interface EphemeralField<Schema extends S.Top> {
  readonly '~foldkit/EphemeralField': EphemeralFieldTypeId
  readonly schema: Schema
  readonly reset: () => ResetValueOf<Schema, Schema['Type']>
}

/** Map of `local` fields: plain Schemas or `Program.local(schema, reset)` wrappers. */
export type LocalFields = Readonly<Record<string, S.Top | LocalField<any>>>

/** Map of `loaded` fields built with `Program.loaded(schema, reset)`. */
export type LoadedFields = Readonly<Record<string, LoadedField<any>>>

/** Map of `ephemeral` fields built with `Program.ephemeral(schema, reset)`. */
export type EphemeralFields = Readonly<Record<string, EphemeralField<any>>>

const localMarker = Symbol.for('foldkit/LocalField')
const loadedMarker = Symbol.for('foldkit/LoadedField')
const ephemeralMarker = Symbol.for('foldkit/EphemeralField')

// NOTE: `DurabilityModel` carries compile-time phantom brands and `Rebuild`
// overrides over Effect's `Schema.Struct`. Every assertion that attaches or
// narrows those phantom types goes through this single helper.
/* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
const typedAs = <A>(value: unknown): A => value as A

/**
 * Declares a `local` field with an explicit reset thunk. Required for `local`
 * fields nested inside a `Program.taggedModel` variant (such as `Loaded.savedPlaceMs`)
 * so shared snapshots and `hydrateFromSynced` can construct the variant cleanly.
 *
 * @example
 * ```typescript
 * local: { savedPlaceMs: Program.local(Milliseconds, () => 0) }
 * ```
 */
export const local = <Type, Schema extends S.Codec<Type, unknown, any, any>>(
  schema: Schema,
  reset: () => ResetValueOf<Schema, NoInfer<Type>>,
): LocalField<Schema> =>
  typedAs<LocalField<Schema>>({
    [localMarker]: true,
    schema,
    reset,
  })

/**
 * Declares a `loaded` field (external store data such as a library shelf or
 * transcript) paired with its reset thunk. Stripped before snapshot encoding,
 * preserved on `LogRefolded`, and writable by Subscriptions.
 *
 * @example
 * ```typescript
 * loaded: { library: Program.loaded(Library, ShelfLoading) }
 * ```
 */
export const loaded = <Type, Schema extends S.Codec<Type, unknown, any, any>>(
  schema: Schema,
  reset: () => ResetValueOf<Schema, NoInfer<Type>>,
): LoadedField<Schema> =>
  typedAs<LoadedField<Schema>>({
    [loadedMarker]: true,
    schema,
    reset,
  })

/**
 * Declares an `ephemeral` field (live session state such as playback transport
 * or a toast notice) paired with its reset thunk. Stripped before snapshot
 * encoding, preserved on `LogRefolded`, and writable by Subscriptions.
 *
 * @example
 * ```typescript
 * ephemeral: { maybeNotice: Program.ephemeral(S.Option(S.String), Option.none) }
 * ```
 */
export const ephemeral = <
  Type,
  Schema extends S.Codec<Type, unknown, any, any>,
>(
  schema: Schema,
  reset: () => ResetValueOf<Schema, NoInfer<Type>>,
): EphemeralField<Schema> =>
  typedAs<EphemeralField<Schema>>({
    [ephemeralMarker]: true,
    schema,
    reset,
  })

const isLocalField = (value: unknown): value is LocalField<any> =>
  Predicate.isObject(value) && localMarker in value

const isLoadedField = (value: unknown): value is LoadedField<any> =>
  Predicate.isObject(value) && loadedMarker in value

const isEphemeralField = (value: unknown): value is EphemeralField<any> =>
  Predicate.isObject(value) && ephemeralMarker in value

// MODEL TYPES

type UnwrapLocalFields<Fields extends LocalFields> = {
  readonly [K in keyof Fields]: Fields[K] extends LocalField<infer Schema>
    ? Schema
    : Fields[K] extends S.Top
      ? Fields[K]
      : never
}

type UnwrapResetFields<
  Fields extends Readonly<Record<string, Readonly<{ schema: S.Top }>>>,
> = {
  readonly [K in keyof Fields]: Fields[K]['schema']
}

type MergedFields<
  Synced extends S.Struct.Fields,
  Local extends LocalFields,
  Loaded extends LoadedFields,
  Ephemeral extends EphemeralFields,
> = Synced &
  UnwrapLocalFields<Local> &
  UnwrapResetFields<Loaded> &
  UnwrapResetFields<Ephemeral>

type BucketOverlap<A, B, C, D> =
  | (keyof A & keyof B)
  | (keyof A & keyof C)
  | (keyof A & keyof D)
  | (keyof B & keyof C)
  | (keyof B & keyof D)
  | (keyof C & keyof D)

/** Phantom durability bucket structure carried on `DurabilityModel` and `DurabilityTaggedModel`. */
export type DurabilityBuckets<
  Synced extends S.Struct.Fields = {},
  Local extends LocalFields = {},
  Loaded extends LoadedFields = {},
  Ephemeral extends EphemeralFields = {},
> = Readonly<{
  synced: Synced
  local: UnwrapLocalFields<Local>
  loaded: Loaded
  ephemeral: Ephemeral
}>

/** A Struct Schema whose every field declares its durability role. */
export interface DurabilityModel<
  Synced extends S.Struct.Fields = {},
  Local extends LocalFields = {},
  Loaded extends LoadedFields = {},
  Ephemeral extends EphemeralFields = {},
> extends S.Struct<MergedFields<Synced, Local, Loaded, Ephemeral>> {
  readonly '~foldkit/DurabilityModel': DurabilityBuckets<
    Synced,
    Local,
    Loaded,
    Ephemeral
  >
  readonly Rebuild: DurabilityModel<Synced, Local, Loaded, Ephemeral>
}

/** Existential constraint accepted by `Subscription.forModel`, `Program.make`, and sync combinators. */
export interface AnyDurabilityModel extends S.Struct<any> {
  readonly '~foldkit/DurabilityModel': DurabilityBuckets<any, any, any, any>
}

/** A callable `TaggedStruct` variant whose payload fields declare durability roles. */
export type DurabilityTaggedModel<
  Tag extends string,
  Synced extends S.Struct.Fields = {},
  Local extends LocalFields = {},
  Loaded extends LoadedFields = {},
  Ephemeral extends EphemeralFields = {},
> = CallableTaggedStruct<Tag, MergedFields<Synced, Local, Loaded, Ephemeral>> &
  Readonly<{
    readonly '~foldkit/DurabilityTag': Tag
    readonly '~foldkit/DurabilityModel': DurabilityBuckets<
      Synced,
      Local,
      Loaded,
      Ephemeral
    >
    readonly Rebuild: DurabilityTaggedModel<
      Tag,
      Synced,
      Local,
      Loaded,
      Ephemeral
    >
  }>

/** Configuration accepted by `Program.model` and `Program.taggedModel`. */
export type ModelConfig<
  Synced extends S.Struct.Fields = {},
  Local extends LocalFields = {},
  Loaded extends LoadedFields = {},
  Ephemeral extends EphemeralFields = {},
> = Readonly<{
  synced?: Synced
  local?: Local
  loaded?: Loaded
  ephemeral?: Ephemeral
  /** Optional synced field naming entity identity for refold merging (for example `key: 'slug'`). */
  key?: keyof Synced & string
}> &
  (BucketOverlap<Synced, Local, Loaded, Ephemeral> extends never
    ? unknown
    : Readonly<{
        readonly __duplicateFieldAcrossDurabilityBuckets: BucketOverlap<
          Synced,
          Local,
          Loaded,
          Ephemeral
        >
      }>)

// CONSTRUCTORS

/** Attaches a `FieldDurability` key annotation to a field Schema. */
export const withFieldDurability = <Schema extends S.Top>(
  schema: Schema,
  entry: FieldDurability,
): Schema => typedAs<Schema>(S.annotateKey({ [durabilityKey]: entry })(schema))

/** Attaches `ModelDurabilityMeta` to a Struct Schema. */
export const withModelDurability = <Schema extends S.Top>(
  schema: Schema,
  meta: ModelDurabilityMeta = { isClassified: true },
): Schema => typedAs<Schema>(schema.annotate({ [durabilityModelKey]: meta }))

const collectAnnotatedFields = (config: {
  readonly synced?: S.Struct.Fields
  readonly local?: LocalFields
  readonly loaded?: LoadedFields
  readonly ephemeral?: EphemeralFields
}): S.Struct.Fields => {
  const fields: Record<string, S.Top> = {}
  const register = (name: string, schema: S.Top, entry: FieldDurability) => {
    if (Object.hasOwn(fields, name)) {
      throw new Error(
        `[foldkit] Program.model: duplicate field "${name}" across durability buckets`,
      )
    }
    fields[name] = withFieldDurability(schema, entry)
  }

  if (config.synced !== undefined) {
    for (const [name, schema] of Record.toEntries(config.synced)) {
      register(name, typedAs<S.Top>(schema), { role: 'Synced' })
    }
  }

  if (config.local !== undefined) {
    for (const [name, entry] of Record.toEntries(config.local)) {
      if (isLocalField(entry)) {
        register(name, typedAs<S.Top>(entry.schema), {
          role: 'Local',
          reset: entry.reset,
        })
      } else {
        register(name, typedAs<S.Top>(entry), { role: 'Local' })
      }
    }
  }

  if (config.loaded !== undefined) {
    for (const [name, entry] of Record.toEntries(config.loaded)) {
      if (!isLoadedField(entry)) {
        throw new Error(
          `[foldkit] Program.model: loaded field "${name}" must be wrapped with Program.loaded(schema, reset)`,
        )
      }
      register(name, typedAs<S.Top>(entry.schema), {
        role: 'Loaded',
        reset: entry.reset,
      })
    }
  }

  if (config.ephemeral !== undefined) {
    for (const [name, entry] of Record.toEntries(config.ephemeral)) {
      if (!isEphemeralField(entry)) {
        throw new Error(
          `[foldkit] Program.model: ephemeral field "${name}" must be wrapped with Program.ephemeral(schema, reset)`,
        )
      }
      register(name, typedAs<S.Top>(entry.schema), {
        role: 'Ephemeral',
        reset: entry.reset,
      })
    }
  }

  return fields
}

/**
 * Defines a Struct Schema whose every field declares its durability role
 * (`synced`, `local`, `loaded`, or `ephemeral`).
 *
 * @example
 * ```typescript
 * const Model = Program.model({
 *   synced: { speed: Speed },
 *   local: { appearance: AppearanceState },
 *   loaded: { library: Program.loaded(Library, ShelfLoading) },
 *   ephemeral: { maybeNotice: Program.ephemeral(S.Option(S.String), Option.none) },
 * })
 * ```
 */
export const model = <
  const Synced extends S.Struct.Fields = {},
  const Local extends LocalFields = {},
  const Loaded extends LoadedFields = {},
  const Ephemeral extends EphemeralFields = {},
>(
  config: ModelConfig<Synced, Local, Loaded, Ephemeral>,
): DurabilityModel<Synced, Local, Loaded, Ephemeral> => {
  const fields = collectAnnotatedFields(config)
  const meta: ModelDurabilityMeta = {
    isClassified: true,
    ...(config.key === undefined ? {} : { key: config.key }),
  }
  const struct = S.Struct(fields).annotate({ [durabilityModelKey]: meta })
  return typedAs<DurabilityModel<Synced, Local, Loaded, Ephemeral>>(struct)
}

/**
 * Defines a callable `TaggedStruct` variant whose payload fields declare
 * durability roles, with an optional entity identity `key` for safe refold
 * merging across union variants.
 *
 * @example
 * ```typescript
 * const Loaded = Program.taggedModel('Loaded', {
 *   key: 'slug',
 *   synced: { slug: TitleSlug, player: TranscriptPlayer.Model },
 *   local: { savedPlaceMs: Program.local(Milliseconds, () => 0) },
 *   ephemeral: { stretch: Program.ephemeral(StretchState, Quiet) },
 * })
 * ```
 */
export const taggedModel = <
  const Tag extends string,
  const Synced extends S.Struct.Fields = {},
  const Local extends LocalFields = {},
  const Loaded extends LoadedFields = {},
  const Ephemeral extends EphemeralFields = {},
>(
  tag: Tag,
  config: ModelConfig<Synced, Local, Loaded, Ephemeral>,
): DurabilityTaggedModel<Tag, Synced, Local, Loaded, Ephemeral> => {
  const fields = collectAnnotatedFields(config)
  const meta: ModelDurabilityMeta = {
    isClassified: true,
    ...(config.key === undefined ? {} : { key: config.key }),
  }
  const tagged = S.TaggedStruct(tag, fields).annotate({
    [durabilityModelKey]: meta,
  })
  return typedAs<DurabilityTaggedModel<Tag, Synced, Local, Loaded, Ephemeral>>(
    callableWith(tagged, {}),
  )
}

// TYPE-LEVEL PROJECTIONS

type DurabilityTaggedCarrier<
  Tag extends string,
  Synced extends S.Struct.Fields,
  Local extends S.Struct.Fields,
  Loaded extends LoadedFields,
  Ephemeral extends EphemeralFields,
> = Readonly<{
  readonly '~foldkit/DurabilityTag': Tag
  readonly '~foldkit/DurabilityModel': Readonly<{
    synced: Synced
    local: Local
    loaded: Loaded
    ephemeral: Ephemeral
  }>
}>

type DurabilityCarrier<
  Synced extends S.Struct.Fields,
  Local extends S.Struct.Fields,
  Loaded extends LoadedFields,
  Ephemeral extends EphemeralFields,
> = Readonly<{
  readonly '~foldkit/DurabilityModel': Readonly<{
    synced: Synced
    local: Local
    loaded: Loaded
    ephemeral: Ephemeral
  }>
}>

/**
 * Projects a `DurabilityModel` Schema down to its `synced`-only shape for
 * shared log folds (`foldSynced`). Leaves without durability metadata stop
 * recursing immediately.
 *
 * @example
 * ```typescript
 * type SyncedBooksModel = Program.SyncedOfSchema<typeof BooksModel>
 * // { readonly speed: Speed; readonly listening: Idle | { readonly _tag: 'Loaded'; ... } }
 * ```
 */
export type SyncedOfSchema<Schema> =
  Schema extends DurabilityTaggedCarrier<
    infer Tag extends string,
    infer Synced extends S.Struct.Fields,
    infer _Local extends S.Struct.Fields,
    infer _Loaded extends LoadedFields,
    infer _Ephemeral extends EphemeralFields
  >
    ? Types.Simplify<
        { readonly _tag: Tag } & {
          readonly [K in keyof Synced]: SyncedOfSchema<Synced[K]>
        }
      >
    : Schema extends DurabilityCarrier<
          infer Synced extends S.Struct.Fields,
          infer _Local extends S.Struct.Fields,
          infer _Loaded extends LoadedFields,
          infer _Ephemeral extends EphemeralFields
        >
      ? Types.Simplify<{
          readonly [K in keyof Synced]: SyncedOfSchema<Synced[K]>
        }>
      : Schema extends S.Union<infer Members>
        ? SyncedOfSchema<Members[number]>
        : Schema extends S.Option<infer Inner>
          ? Option.Option<SyncedOfSchema<Inner>>
          : Schema extends S.OptionFromOptionalKey<infer Inner>
            ? Option.Option<SyncedOfSchema<Inner>>
            : Schema extends S.NonEmptyArray<infer Elem>
              ? Array.NonEmptyReadonlyArray<SyncedOfSchema<Elem>>
              : Schema extends S.$Array<infer Elem>
                ? ReadonlyArray<SyncedOfSchema<Elem>>
                : Schema extends S.$Record<infer Key, infer Value>
                  ? Readonly<Record<Key['Type'], SyncedOfSchema<Value>>>
                  : Schema extends S.Top
                    ? Schema['Type']
                    : never

type HasWritableField<Schema> =
  Schema extends DurabilityCarrier<
    infer Synced extends S.Struct.Fields,
    infer Local extends S.Struct.Fields,
    infer Loaded extends LoadedFields,
    infer Ephemeral extends EphemeralFields
  >
    ? keyof Loaded extends never
      ? keyof Ephemeral extends never
        ? HasWritableInFields<Synced> extends true
          ? true
          : HasWritableInFields<Local>
        : true
      : true
    : Schema extends S.Union<infer Members>
      ? true extends (
          Members[number] extends infer Member
            ? HasWritableField<Member>
            : never
        )
        ? true
        : false
      : Schema extends S.Option<infer Inner>
        ? HasWritableField<Inner>
        : Schema extends S.OptionFromOptionalKey<infer Inner>
          ? HasWritableField<Inner>
          : false

type HasWritableInFields<Fields extends S.Struct.Fields> = true extends {
  [K in keyof Fields]: HasWritableField<Fields[K]>
}[keyof Fields]
  ? true
  : false

type NestedOrForbidden<Fields extends S.Struct.Fields> = {
  readonly [K in keyof Fields]?: HasWritableField<Fields[K]> extends true
    ? SubscriptionPatch<Fields[K]>
    : never
}

type UnionVariantPatches<Members extends ReadonlyArray<S.Constraint>> = {
  readonly _tag?: never
} & {
  readonly [Member in Members[number] as Member extends Readonly<{
    readonly '~foldkit/DurabilityTag': infer Tag extends string
  }>
    ? HasWritableField<Member> extends true
      ? Tag
      : never
    : never]?: SubscriptionPatch<Member>
}

/**
 * Compile-time writable patch type for a `DurabilityModel` Subscription.
 * Only `loaded` and `ephemeral` fields (and nested paths leading to them) are
 * assignable; `synced` and `local` leaves are typed `?: never`, blocking inline
 * literals, object spreads, and aliased variables in `tsc`.
 *
 * @example
 * ```typescript
 * const patch: Program.SubscriptionPatch<typeof BooksModel> = {
 *   library: ShelfReady({ shelf }),
 *   listening: { Loaded: { player: { transcript: TranscriptLoaded({ passages }) } } },
 * }
 * ```
 */
export type SubscriptionPatch<Schema> =
  Schema extends DurabilityCarrier<
    infer Synced extends S.Struct.Fields,
    infer Local extends S.Struct.Fields,
    infer Loaded extends LoadedFields,
    infer Ephemeral extends EphemeralFields
  >
    ? NestedOrForbidden<Synced> &
        NestedOrForbidden<Local> & {
          readonly [K in keyof Loaded]?: Loaded[K]['schema']['Type']
        } & {
          readonly [K in keyof Ephemeral]?: Ephemeral[K]['schema']['Type']
        }
    : Schema extends S.Union<infer Members>
      ? UnionVariantPatches<Members>
      : Schema extends S.Option<infer Inner>
        ? SubscriptionPatch<Inner>
        : Schema extends S.OptionFromOptionalKey<infer Inner>
          ? SubscriptionPatch<Inner>
          : never

// AST INSPECTION AND MEMOIZATION

const durabilityBelowCache = new WeakMap<SchemaAST.AST, boolean>()
const taggedUnionIndexCache = new WeakMap<
  SchemaAST.Union,
  Option.Option<ReadonlyMap<string, SchemaAST.Objects>>
>()
const propertyMapCache = new WeakMap<
  SchemaAST.Objects,
  ReadonlyMap<string, SchemaAST.PropertySignature>
>()

const isFieldDurability = (value: unknown): value is FieldDurability =>
  Predicate.isObject(value) &&
  Predicate.hasProperty(value, 'role') &&
  Predicate.isString(value.role) &&
  (value.role === 'Synced' ||
    value.role === 'Local' ||
    value.role === 'Loaded' ||
    value.role === 'Ephemeral')

const isOptionalKeyAst = (ast: SchemaAST.AST): boolean =>
  ast.context?.isOptional === true

/** Reads the `FieldDurability` key annotation from a PropertySignature's type AST. */
export const durabilityOf = (
  ast: SchemaAST.AST,
): Option.Option<FieldDurability> => {
  const annotations = ast.context?.annotations
  if (annotations === undefined || !Predicate.isObject(annotations)) {
    return Option.none()
  }
  const raw = Reflect.get(annotations, durabilityKey)
  return isFieldDurability(raw) ? Option.some(raw) : Option.none()
}

/** Reads `ModelDurabilityMeta` from an AST node's annotations. */
export const modelMetaOf = (
  ast: SchemaAST.AST,
): Option.Option<ModelDurabilityMeta> => {
  const annotations = ast.annotations
  if (annotations === undefined || !Predicate.isObject(annotations)) {
    return Option.none()
  }
  const raw = Reflect.get(annotations, durabilityModelKey)
  if (
    Predicate.isObject(raw) &&
    Predicate.hasProperty(raw, 'isClassified') &&
    raw.isClassified === true
  ) {
    const key =
      Predicate.hasProperty(raw, 'key') && Predicate.isString(raw.key)
        ? raw.key
        : undefined
    return Option.some(
      key === undefined ? { isClassified: true } : { isClassified: true, key },
    )
  }
  return Option.none()
}

/** True when the AST node was constructed by `Program.model` or `Program.taggedModel`. */
export const isDurabilityModelAst = (ast: SchemaAST.AST): boolean =>
  Option.isSome(modelMetaOf(ast))

/** True when any field in a Struct fields bag carries a durability key annotation. */
export const hasClassifiedFields = (fields: S.Struct.Fields): boolean =>
  Array.some(Object.values(fields), field =>
    Option.isSome(durabilityOf(field.ast)),
  )

const isOptionAst = (ast: SchemaAST.AST): ast is SchemaAST.Declaration => {
  if (!SchemaAST.isDeclaration(ast)) {
    return false
  }
  const annotations = ast.annotations
  if (annotations === undefined || !Predicate.isObject(annotations)) {
    return false
  }
  const typeConstructor = Reflect.get(annotations, 'typeConstructor')
  return (
    Predicate.isObject(typeConstructor) &&
    Predicate.hasProperty(typeConstructor, '_tag') &&
    typeConstructor._tag === 'effect/Option'
  )
}

const unwrapSuspend = (ast: SchemaAST.AST): SchemaAST.AST => {
  let current = ast
  const visited = new Set<SchemaAST.AST>()
  while (SchemaAST.isSuspend(current)) {
    if (visited.has(current)) {
      return current
    }
    visited.add(current)
    current = current.thunk()
  }
  return current
}

const computeHasDurabilityBelow = (
  ast: SchemaAST.AST,
  visited: Set<SchemaAST.AST>,
): boolean => {
  const cached = durabilityBelowCache.get(ast)
  if (cached !== undefined) {
    return cached
  }
  if (visited.has(ast)) {
    return false
  }
  visited.add(ast)

  let result = false
  if (SchemaAST.isSuspend(ast)) {
    result = computeHasDurabilityBelow(ast.thunk(), visited)
  } else if (SchemaAST.isObjects(ast)) {
    result =
      Array.some(
        ast.propertySignatures,
        ps =>
          Option.isSome(durabilityOf(ps.type)) ||
          computeHasDurabilityBelow(ps.type, visited),
      ) ||
      Array.some(ast.indexSignatures, is =>
        computeHasDurabilityBelow(is.type, visited),
      )
  } else if (SchemaAST.isUnion(ast)) {
    result = Array.some(ast.types, member =>
      computeHasDurabilityBelow(member, visited),
    )
  } else if (isOptionAst(ast)) {
    result = Option.exists(Array.head(ast.typeParameters), inner =>
      computeHasDurabilityBelow(inner, visited),
    )
  } else if (SchemaAST.isArrays(ast)) {
    result =
      Array.some(ast.elements, elem =>
        computeHasDurabilityBelow(elem, visited),
      ) ||
      Array.some(ast.rest, elem => computeHasDurabilityBelow(elem, visited))
  }

  durabilityBelowCache.set(ast, result)
  return result
}

/**
 * Memoized O(1) predicate reporting whether any nested property, union member,
 * Option payload, or array element inside `ast` carries durability annotations.
 * Plain data leaves (`Title`, `Bookmark`, `Word`) compute `false` once and
 * short-circuit every walker forever.
 */
export const hasDurabilityBelow = (ast: SchemaAST.AST): boolean => {
  const cached = durabilityBelowCache.get(ast)
  if (cached !== undefined) {
    return cached
  }
  return computeHasDurabilityBelow(ast, new Set())
}

const readTag = (value: unknown): Option.Option<string> =>
  Predicate.isObject(value) &&
  Predicate.hasProperty(value, '_tag') &&
  Predicate.isString(value._tag)
    ? Option.some(value._tag)
    : Option.none()

const tagLiteralOf = (ast: SchemaAST.Objects): Option.Option<string> =>
  Option.flatMap(
    Array.findFirst(ast.propertySignatures, ps => ps.name === '_tag'),
    ps =>
      SchemaAST.isLiteral(ps.type) && Predicate.isString(ps.type.literal)
        ? Option.some(ps.type.literal)
        : Option.none(),
  )

const taggedUnionIndex = (
  unionAst: SchemaAST.Union,
): Option.Option<ReadonlyMap<string, SchemaAST.Objects>> => {
  const cached = taggedUnionIndexCache.get(unionAst)
  if (cached !== undefined) {
    return cached
  }
  const index = new Map<string, SchemaAST.Objects>()
  let isAllTagged = true
  for (const rawMember of unionAst.types) {
    const member = unwrapSuspend(rawMember)
    if (!SchemaAST.isObjects(member)) {
      isAllTagged = false
      break
    }
    const maybeTag = tagLiteralOf(member)
    if (Option.isNone(maybeTag)) {
      isAllTagged = false
      break
    }
    index.set(maybeTag.value, member)
  }
  const result = isAllTagged ? Option.some(index) : Option.none()
  taggedUnionIndexCache.set(unionAst, result)
  return result
}

const resolveUnionMember = (
  unionAst: SchemaAST.Union,
  value: unknown,
): Option.Option<SchemaAST.AST> => {
  const maybeIndex = taggedUnionIndex(unionAst)
  if (Option.isSome(maybeIndex)) {
    return Option.flatMap(readTag(value), tag =>
      Option.fromNullishOr(maybeIndex.value.get(tag)),
    )
  }
  return Array.findFirst(unionAst.types, member => S.is(S.make(member))(value))
}

const propertyMapOf = (
  objectsAst: SchemaAST.Objects,
): ReadonlyMap<string, SchemaAST.PropertySignature> => {
  const cached = propertyMapCache.get(objectsAst)
  if (cached !== undefined) {
    return cached
  }
  const map = new Map<string, SchemaAST.PropertySignature>()
  for (const ps of objectsAst.propertySignatures) {
    if (Predicate.isString(ps.name)) {
      map.set(ps.name, ps)
    }
  }
  propertyMapCache.set(objectsAst, map)
  return map
}

// WALKER A: STRIP FOR LOCAL SNAPSHOT

const isSameResetValue = (current: unknown, resetVal: unknown): boolean => {
  if (Object.is(current, resetVal) || Equal.equals(current, resetVal)) {
    return true
  }
  if (globalThis.Array.isArray(current) && globalThis.Array.isArray(resetVal)) {
    return (
      current.length === resetVal.length &&
      Array.every(current, (item, index) =>
        Object.is(item, Option.getOrUndefined(Array.get(resetVal, index))),
      )
    )
  }
  if (
    Predicate.isObject(current) &&
    Predicate.isObject(resetVal) &&
    !Option.isOption(current) &&
    !Option.isOption(resetVal)
  ) {
    const currentKeys = Object.keys(current)
    const resetKeys = Object.keys(resetVal)
    return (
      currentKeys.length === resetKeys.length &&
      Array.every(
        currentKeys,
        key =>
          Object.hasOwn(resetVal, key) &&
          Object.is(Reflect.get(current, key), Reflect.get(resetVal, key)),
      )
    )
  }
  return false
}

/**
 * Replaces every `Loaded` and `Ephemeral` field (including inside nested
 * Submodels, tagged unions, Options, arrays, and records) with its declared
 * `reset()` value. Copy-on-write: returns `value` unchanged when nothing strips.
 */
export const stripForLocalSnapshot = <Value>(
  ast: SchemaAST.AST,
  value: Value,
): Value => {
  if (!hasDurabilityBelow(ast) || value === null || value === undefined) {
    return value
  }
  if (SchemaAST.isSuspend(ast)) {
    return stripForLocalSnapshot(ast.thunk(), value)
  }
  if (SchemaAST.isUnion(ast)) {
    return Option.match(resolveUnionMember(ast, value), {
      onNone: () => value,
      onSome: memberAst => stripForLocalSnapshot(memberAst, value),
    })
  }
  if (isOptionAst(ast)) {
    if (Option.isOption(value) && Option.isSome(value)) {
      const maybeInner = Array.head(ast.typeParameters)
      if (Option.isSome(maybeInner)) {
        const nextInner = stripForLocalSnapshot(maybeInner.value, value.value)
        return Object.is(nextInner, value.value)
          ? value
          : typedAs<Value>(Option.some(nextInner))
      }
    }
    return value
  }
  if (SchemaAST.isArrays(ast)) {
    if (!globalThis.Array.isArray(value)) {
      return value
    }
    const maybeRest = Array.head(ast.rest)
    let changed = false
    const next: Array<unknown> = []
    for (let index = 0; index < value.length; index += 1) {
      const currentItem = Option.getOrUndefined(Array.get(value, index))
      const maybeElemAst = Option.orElse(
        Array.get(ast.elements, index),
        () => maybeRest,
      )
      if (
        Option.isSome(maybeElemAst) &&
        hasDurabilityBelow(maybeElemAst.value)
      ) {
        const nextItem = stripForLocalSnapshot(maybeElemAst.value, currentItem)
        if (!Object.is(nextItem, currentItem)) {
          changed = true
        }
        next.push(nextItem)
      } else {
        next.push(currentItem)
      }
    }
    return changed ? typedAs<Value>(next) : value
  }
  if (SchemaAST.isObjects(ast)) {
    if (!Predicate.isObject(value)) {
      return value
    }
    let changed = false
    let next: Record<string, unknown> | undefined = undefined
    const write = (key: string, nextVal: unknown, isOptional = false) => {
      if (isOptional && nextVal === undefined) {
        if (Object.hasOwn(value, key)) {
          if (next === undefined) {
            next = { ...value }
          }
          delete next[key]
          changed = true
        }
        return
      }
      const currentVal = Reflect.get(value, key)
      if (
        !Object.hasOwn(value, key) ||
        !isSameResetValue(currentVal, nextVal)
      ) {
        if (next === undefined) {
          next = { ...value }
        }
        next[key] = nextVal
        changed = true
      }
    }

    const handledKeys = new Set<string>()
    for (const ps of ast.propertySignatures) {
      if (!Predicate.isString(ps.name) || ps.name === '_tag') {
        continue
      }
      handledKeys.add(ps.name)
      const maybeDur = durabilityOf(ps.type)
      if (Option.isSome(maybeDur)) {
        const dur = maybeDur.value
        if (dur.role === 'Loaded' || dur.role === 'Ephemeral') {
          write(ps.name, dur.reset(), isOptionalKeyAst(ps.type))
        } else if (
          hasDurabilityBelow(ps.type) &&
          Object.hasOwn(value, ps.name)
        ) {
          write(
            ps.name,
            stripForLocalSnapshot(ps.type, Reflect.get(value, ps.name)),
          )
        }
      } else if (hasDurabilityBelow(ps.type) && Object.hasOwn(value, ps.name)) {
        write(
          ps.name,
          stripForLocalSnapshot(ps.type, Reflect.get(value, ps.name)),
        )
      }
    }

    for (const is of ast.indexSignatures) {
      if (!hasDurabilityBelow(is.type)) {
        continue
      }
      for (const key of Object.keys(value)) {
        if (handledKeys.has(key)) {
          continue
        }
        write(key, stripForLocalSnapshot(is.type, Reflect.get(value, key)))
      }
    }

    return changed && next !== undefined ? typedAs<Value>(next) : value
  }

  return value
}

// WALKER B: STRIP FOR SHARED SNAPSHOT

/**
 * Replaces `Loaded` and `Ephemeral` fields with their `reset()` values and
 * replaces `Local` fields with their `reset()` value or matching field from
 * `initialValue`, leaving only `Synced` domain state in shared ring snapshots.
 */
export const stripForSharedSnapshot = <Value>(
  ast: SchemaAST.AST,
  value: Value,
  initialValue?: unknown,
): Value => {
  if (!hasDurabilityBelow(ast) || value === null || value === undefined) {
    return value
  }
  if (SchemaAST.isSuspend(ast)) {
    return stripForSharedSnapshot(ast.thunk(), value, initialValue)
  }
  if (SchemaAST.isUnion(ast)) {
    return Option.match(resolveUnionMember(ast, value), {
      onNone: () => value,
      onSome: memberAst => {
        const maybeValueTag = readTag(value)
        const maybeInitTag = readTag(initialValue)
        const matchingInitial =
          Option.isSome(maybeValueTag) &&
          Option.isSome(maybeInitTag) &&
          maybeValueTag.value === maybeInitTag.value
            ? initialValue
            : undefined
        return stripForSharedSnapshot(memberAst, value, matchingInitial)
      },
    })
  }
  if (isOptionAst(ast)) {
    if (Option.isOption(value) && Option.isSome(value)) {
      const maybeInner = Array.head(ast.typeParameters)
      if (Option.isSome(maybeInner)) {
        const initInner =
          Option.isOption(initialValue) && Option.isSome(initialValue)
            ? initialValue.value
            : undefined
        const nextInner = stripForSharedSnapshot(
          maybeInner.value,
          value.value,
          initInner,
        )
        return Object.is(nextInner, value.value)
          ? value
          : typedAs<Value>(Option.some(nextInner))
      }
    }
    return value
  }
  if (SchemaAST.isArrays(ast)) {
    if (!globalThis.Array.isArray(value)) {
      return value
    }
    const maybeRest = Array.head(ast.rest)
    const initArr = globalThis.Array.isArray(initialValue)
      ? initialValue
      : undefined
    let changed = false
    const next: Array<unknown> = []
    for (let index = 0; index < value.length; index += 1) {
      const currentItem = Option.getOrUndefined(Array.get(value, index))
      const initItem =
        initArr === undefined
          ? undefined
          : Option.getOrUndefined(Array.get(initArr, index))
      const maybeElemAst = Option.orElse(
        Array.get(ast.elements, index),
        () => maybeRest,
      )
      if (
        Option.isSome(maybeElemAst) &&
        hasDurabilityBelow(maybeElemAst.value)
      ) {
        const nextItem = stripForSharedSnapshot(
          maybeElemAst.value,
          currentItem,
          initItem,
        )
        if (!Object.is(nextItem, currentItem)) {
          changed = true
        }
        next.push(nextItem)
      } else {
        next.push(currentItem)
      }
    }
    return changed ? typedAs<Value>(next) : value
  }
  if (SchemaAST.isObjects(ast)) {
    if (!Predicate.isObject(value)) {
      return value
    }
    const initObj = Predicate.isObject(initialValue) ? initialValue : undefined
    let changed = false
    let next: Record<string, unknown> | undefined = undefined
    const write = (key: string, nextVal: unknown, isOptional = false) => {
      if (isOptional && nextVal === undefined) {
        if (Object.hasOwn(value, key)) {
          if (next === undefined) {
            next = { ...value }
          }
          delete next[key]
          changed = true
        }
        return
      }
      const currentVal = Reflect.get(value, key)
      if (
        !Object.hasOwn(value, key) ||
        !isSameResetValue(currentVal, nextVal)
      ) {
        if (next === undefined) {
          next = { ...value }
        }
        next[key] = nextVal
        changed = true
      }
    }

    const handledKeys = new Set<string>()
    for (const ps of ast.propertySignatures) {
      if (!Predicate.isString(ps.name) || ps.name === '_tag') {
        continue
      }
      handledKeys.add(ps.name)
      const maybeDur = durabilityOf(ps.type)
      if (Option.isSome(maybeDur)) {
        const dur = maybeDur.value
        if (dur.role === 'Loaded' || dur.role === 'Ephemeral') {
          write(ps.name, dur.reset(), isOptionalKeyAst(ps.type))
        } else if (dur.role === 'Local') {
          if (dur.reset !== undefined) {
            write(ps.name, dur.reset(), isOptionalKeyAst(ps.type))
          } else if (initObj !== undefined && Object.hasOwn(initObj, ps.name)) {
            const initField = Reflect.get(initObj, ps.name)
            write(
              ps.name,
              hasDurabilityBelow(ps.type)
                ? stripForSharedSnapshot(ps.type, initField, initField)
                : initField,
            )
          } else if (
            hasDurabilityBelow(ps.type) &&
            Object.hasOwn(value, ps.name)
          ) {
            write(
              ps.name,
              stripForSharedSnapshot(
                ps.type,
                Reflect.get(value, ps.name),
                undefined,
              ),
            )
          }
        } else if (
          hasDurabilityBelow(ps.type) &&
          Object.hasOwn(value, ps.name)
        ) {
          const initField =
            initObj !== undefined && Object.hasOwn(initObj, ps.name)
              ? Reflect.get(initObj, ps.name)
              : undefined
          write(
            ps.name,
            stripForSharedSnapshot(
              ps.type,
              Reflect.get(value, ps.name),
              initField,
            ),
          )
        }
      } else if (hasDurabilityBelow(ps.type) && Object.hasOwn(value, ps.name)) {
        const initField =
          initObj !== undefined && Object.hasOwn(initObj, ps.name)
            ? Reflect.get(initObj, ps.name)
            : undefined
        write(
          ps.name,
          stripForSharedSnapshot(
            ps.type,
            Reflect.get(value, ps.name),
            initField,
          ),
        )
      }
    }

    for (const is of ast.indexSignatures) {
      if (!hasDurabilityBelow(is.type)) {
        continue
      }
      for (const key of Object.keys(value)) {
        if (handledKeys.has(key)) {
          continue
        }
        const initEntry =
          initObj !== undefined && Object.hasOwn(initObj, key)
            ? Reflect.get(initObj, key)
            : undefined
        write(
          key,
          stripForSharedSnapshot(is.type, Reflect.get(value, key), initEntry),
        )
      }
    }

    return changed && next !== undefined ? typedAs<Value>(next) : value
  }

  return value
}

// WALKER C: MERGE ON REFOLD

/**
 * Auto-derived `keepOnRefold`: preserves `Local`, `Loaded`, and `Ephemeral`
 * fields from `current` while taking `Synced` fields from `refolded`. Respects
 * tagged-union variant switches and `key` identity switches so state from one
 * entity (for example Book A's transcript) never leaks onto another (Book B).
 */
export const mergeOnRefold = <Value>(
  ast: SchemaAST.AST,
  current: Value,
  refolded: Value,
): Value => {
  if (
    !hasDurabilityBelow(ast) ||
    current === null ||
    current === undefined ||
    refolded === null ||
    refolded === undefined
  ) {
    return refolded
  }
  if (SchemaAST.isSuspend(ast)) {
    return mergeOnRefold(ast.thunk(), current, refolded)
  }
  if (SchemaAST.isUnion(ast)) {
    const maybeCurrentTag = readTag(current)
    const maybeRefoldedTag = readTag(refolded)
    if (Option.isSome(maybeCurrentTag) && Option.isSome(maybeRefoldedTag)) {
      if (maybeCurrentTag.value !== maybeRefoldedTag.value) {
        return refolded
      }
      return Option.match(resolveUnionMember(ast, refolded), {
        onNone: () => refolded,
        onSome: memberAst => mergeOnRefold(memberAst, current, refolded),
      })
    }
    const maybeCurrentMember = resolveUnionMember(ast, current)
    const maybeRefoldedMember = resolveUnionMember(ast, refolded)
    if (
      Option.isSome(maybeCurrentMember) &&
      Option.isSome(maybeRefoldedMember) &&
      maybeCurrentMember.value === maybeRefoldedMember.value
    ) {
      return mergeOnRefold(maybeRefoldedMember.value, current, refolded)
    }
    return refolded
  }
  if (isOptionAst(ast)) {
    if (
      Option.isOption(current) &&
      Option.isOption(refolded) &&
      Option.isSome(current) &&
      Option.isSome(refolded)
    ) {
      const maybeInner = Array.head(ast.typeParameters)
      if (Option.isSome(maybeInner)) {
        const merged = mergeOnRefold(
          maybeInner.value,
          current.value,
          refolded.value,
        )
        return Object.is(merged, refolded.value)
          ? refolded
          : typedAs<Value>(Option.some(merged))
      }
    }
    return refolded
  }
  if (SchemaAST.isArrays(ast)) {
    if (
      !globalThis.Array.isArray(current) ||
      !globalThis.Array.isArray(refolded)
    ) {
      return refolded
    }
    if (Array.isReadonlyArrayEmpty(ast.rest) && ast.elements.length > 0) {
      let changed = false
      const next: Array<unknown> = []
      for (let index = 0; index < refolded.length; index += 1) {
        const refItem = Option.getOrUndefined(Array.get(refolded, index))
        const maybeElemAst = Array.get(ast.elements, index)
        if (
          index < current.length &&
          Option.isSome(maybeElemAst) &&
          hasDurabilityBelow(maybeElemAst.value)
        ) {
          const curItem = Option.getOrUndefined(Array.get(current, index))
          const mergedItem = mergeOnRefold(maybeElemAst.value, curItem, refItem)
          if (!Object.is(mergedItem, refItem)) {
            changed = true
          }
          next.push(mergedItem)
        } else {
          next.push(refItem)
        }
      }
      return changed ? typedAs<Value>(next) : refolded
    }
    const maybeRest = Array.head(ast.rest)
    if (Option.isSome(maybeRest)) {
      const elemAst = unwrapSuspend(maybeRest.value)
      const maybeElemKey = Option.flatMap(modelMetaOf(elemAst), meta =>
        Option.fromNullishOr(meta.key),
      )
      if (Option.isSome(maybeElemKey)) {
        const idKey = maybeElemKey.value
        let changed = false
        const next: Array<unknown> = []
        for (const refItem of refolded) {
          if (!Predicate.isObject(refItem)) {
            next.push(refItem)
            continue
          }
          const refId = Reflect.get(refItem, idKey)
          const maybeMatch = Array.findFirst(
            current,
            candidate =>
              Predicate.isObject(candidate) &&
              Equal.equals(Reflect.get(candidate, idKey), refId),
          )
          if (Option.isSome(maybeMatch)) {
            const mergedItem = mergeOnRefold(elemAst, maybeMatch.value, refItem)
            if (!Object.is(mergedItem, refItem)) {
              changed = true
            }
            next.push(mergedItem)
          } else {
            next.push(refItem)
          }
        }
        return changed ? typedAs<Value>(next) : refolded
      }
    }
    return refolded
  }
  if (SchemaAST.isObjects(ast)) {
    if (!Predicate.isObject(current) || !Predicate.isObject(refolded)) {
      return refolded
    }
    const maybeMeta = modelMetaOf(ast)
    if (Option.isSome(maybeMeta) && maybeMeta.value.key !== undefined) {
      const idKey = maybeMeta.value.key
      if (
        !Equal.equals(Reflect.get(current, idKey), Reflect.get(refolded, idKey))
      ) {
        return refolded
      }
    }

    let changed = false
    let next: Record<string, unknown> | undefined = undefined
    const write = (key: string, nextVal: unknown) => {
      const refVal = Reflect.get(refolded, key)
      if (!Object.is(refVal, nextVal)) {
        if (next === undefined) {
          next = { ...refolded }
        }
        next[key] = nextVal
        changed = true
      }
    }

    const handledKeys = new Set<string>()
    for (const ps of ast.propertySignatures) {
      if (!Predicate.isString(ps.name) || ps.name === '_tag') {
        continue
      }
      handledKeys.add(ps.name)
      const maybeDur = durabilityOf(ps.type)
      if (Option.isSome(maybeDur)) {
        const dur = maybeDur.value
        if (
          dur.role === 'Local' ||
          dur.role === 'Loaded' ||
          dur.role === 'Ephemeral'
        ) {
          if (Object.hasOwn(current, ps.name)) {
            write(ps.name, Reflect.get(current, ps.name))
          } else if (
            isOptionalKeyAst(ps.type) &&
            Object.hasOwn(refolded, ps.name)
          ) {
            if (next === undefined) {
              next = { ...refolded }
            }
            delete next[ps.name]
            changed = true
          }
        } else if (
          hasDurabilityBelow(ps.type) &&
          Object.hasOwn(current, ps.name) &&
          Object.hasOwn(refolded, ps.name)
        ) {
          write(
            ps.name,
            mergeOnRefold(
              ps.type,
              Reflect.get(current, ps.name),
              Reflect.get(refolded, ps.name),
            ),
          )
        }
      } else if (
        hasDurabilityBelow(ps.type) &&
        Object.hasOwn(current, ps.name) &&
        Object.hasOwn(refolded, ps.name)
      ) {
        write(
          ps.name,
          mergeOnRefold(
            ps.type,
            Reflect.get(current, ps.name),
            Reflect.get(refolded, ps.name),
          ),
        )
      }
    }

    for (const is of ast.indexSignatures) {
      if (!hasDurabilityBelow(is.type)) {
        continue
      }
      for (const key of Object.keys(refolded)) {
        if (handledKeys.has(key)) {
          continue
        }
        if (Object.hasOwn(current, key)) {
          write(
            key,
            mergeOnRefold(
              is.type,
              Reflect.get(current, key),
              Reflect.get(refolded, key),
            ),
          )
        }
      }
    }

    return changed && next !== undefined ? typedAs<Value>(next) : refolded
  }

  return refolded
}

// WALKER D: APPLY SUBSCRIPTION PATCH

/**
 * Applies a `SubscriptionPatch` onto `current`, allowing writes only to
 * `Loaded` and `Ephemeral` fields (including nested paths inside Submodels,
 * tagged unions, and Options). Returns `current` unchanged when a union
 * variant or Option is no longer active (race-free no-op), and throws
 * {@link ForbiddenSubscriptionWriteError} on any illegal write.
 */
export const applySubscriptionPatch = <Value>(
  ast: SchemaAST.AST,
  current: Value,
  patch: unknown,
  path: string = '',
): Value => {
  if (patch === undefined) {
    return current
  }
  if (SchemaAST.isSuspend(ast)) {
    return applySubscriptionPatch(ast.thunk(), current, patch, path)
  }
  if (SchemaAST.isUnion(ast)) {
    if (!Predicate.isObject(patch)) {
      throw new ForbiddenSubscriptionWriteError({
        path: path === '' ? '<root>' : path,
        role: 'Union',
      })
    }
    if (Predicate.hasProperty(patch, '_tag')) {
      throw new ForbiddenSubscriptionWriteError({
        path: path === '' ? '<root>' : path,
        role: 'UnionVariantReplacement',
      })
    }
    const maybeTag = readTag(current)
    if (Option.isNone(maybeTag)) {
      return current
    }
    const activeTag = maybeTag.value
    if (!Object.hasOwn(patch, activeTag)) {
      return current
    }
    const variantPatch = Reflect.get(patch, activeTag)
    if (variantPatch === undefined) {
      return current
    }
    return Option.match(resolveUnionMember(ast, current), {
      onNone: () => current,
      onSome: memberAst =>
        applySubscriptionPatch(
          memberAst,
          current,
          variantPatch,
          path === '' ? activeTag : `${path}.${activeTag}`,
        ),
    })
  }
  if (isOptionAst(ast)) {
    if (Option.isOption(current) && Option.isSome(current)) {
      const maybeInner = Array.head(ast.typeParameters)
      if (Option.isSome(maybeInner)) {
        const nextInner = applySubscriptionPatch(
          maybeInner.value,
          current.value,
          patch,
          path,
        )
        return Object.is(nextInner, current.value)
          ? current
          : typedAs<Value>(Option.some(nextInner))
      }
    }
    return current
  }
  if (SchemaAST.isObjects(ast)) {
    if (!Predicate.isObject(current) || !Predicate.isObject(patch)) {
      return current
    }
    const propMap = propertyMapOf(ast)
    let changed = false
    let next: Record<string, unknown> | undefined = undefined

    for (const key of Object.keys(patch)) {
      const patchVal = Reflect.get(patch, key)
      if (patchVal === undefined) {
        continue
      }
      const fieldPath = path === '' ? key : `${path}.${key}`
      const ps = propMap.get(key)
      if (ps === undefined) {
        throw new ForbiddenSubscriptionWriteError({
          path: fieldPath,
          role: 'UnknownField',
        })
      }
      const maybeDur = durabilityOf(ps.type)
      let nextVal: unknown
      if (Option.isSome(maybeDur)) {
        const dur = maybeDur.value
        if (dur.role === 'Loaded' || dur.role === 'Ephemeral') {
          nextVal = patchVal
        } else if (hasDurabilityBelow(ps.type)) {
          nextVal = applySubscriptionPatch(
            ps.type,
            Reflect.get(current, key),
            patchVal,
            fieldPath,
          )
        } else {
          throw new ForbiddenSubscriptionWriteError({
            path: fieldPath,
            role: dur.role,
          })
        }
      } else if (hasDurabilityBelow(ps.type)) {
        nextVal = applySubscriptionPatch(
          ps.type,
          Reflect.get(current, key),
          patchVal,
          fieldPath,
        )
      } else {
        throw new ForbiddenSubscriptionWriteError({
          path: fieldPath,
          role: 'Unclassified',
        })
      }

      if (!Object.is(Reflect.get(current, key), nextVal)) {
        if (next === undefined) {
          next = { ...current }
        }
        next[key] = nextVal
        changed = true
      }
    }

    return changed && next !== undefined ? typedAs<Value>(next) : current
  }

  throw new ForbiddenSubscriptionWriteError({
    path: path === '' ? '<root>' : path,
    role: 'Leaf',
  })
}

// SYNCED PROJECTION AND HYDRATION

/**
 * Projects a runtime Model value down to its `Synced`-only shape matching
 * `SyncedOfSchema`, omitting `Local`, `Loaded`, and `Ephemeral` fields.
 */
export const projectSynced = (ast: SchemaAST.AST, value: unknown): unknown => {
  if (!hasDurabilityBelow(ast) || value === null || value === undefined) {
    return value
  }
  if (SchemaAST.isSuspend(ast)) {
    return projectSynced(ast.thunk(), value)
  }
  if (SchemaAST.isUnion(ast)) {
    return Option.match(resolveUnionMember(ast, value), {
      onNone: () => value,
      onSome: memberAst => projectSynced(memberAst, value),
    })
  }
  if (isOptionAst(ast)) {
    if (Option.isOption(value) && Option.isSome(value)) {
      const maybeInner = Array.head(ast.typeParameters)
      if (Option.isSome(maybeInner)) {
        return Option.some(projectSynced(maybeInner.value, value.value))
      }
    }
    return value
  }
  if (SchemaAST.isArrays(ast)) {
    if (!globalThis.Array.isArray(value)) {
      return value
    }
    const maybeRest = Array.head(ast.rest)
    return Array.map(value, (item, index) => {
      const maybeElemAst = Option.orElse(
        Array.get(ast.elements, index),
        () => maybeRest,
      )
      return Option.isSome(maybeElemAst) &&
        hasDurabilityBelow(maybeElemAst.value)
        ? projectSynced(maybeElemAst.value, item)
        : item
    })
  }
  if (SchemaAST.isObjects(ast)) {
    if (!Predicate.isObject(value)) {
      return value
    }
    const result: Record<string, unknown> = {}
    const isClassified = isDurabilityModelAst(ast)
    const handledKeys = new Set<string>()
    for (const ps of ast.propertySignatures) {
      if (!Predicate.isString(ps.name)) {
        continue
      }
      handledKeys.add(ps.name)
      if (ps.name === '_tag') {
        result['_tag'] = Reflect.get(value, '_tag')
        continue
      }
      const maybeDur = durabilityOf(ps.type)
      if (Option.isSome(maybeDur)) {
        if (maybeDur.value.role === 'Synced') {
          const fieldVal = Reflect.get(value, ps.name)
          result[ps.name] = hasDurabilityBelow(ps.type)
            ? projectSynced(ps.type, fieldVal)
            : fieldVal
        }
      } else if (!isClassified) {
        const fieldVal = Reflect.get(value, ps.name)
        result[ps.name] = hasDurabilityBelow(ps.type)
          ? projectSynced(ps.type, fieldVal)
          : fieldVal
      }
    }
    for (const is of ast.indexSignatures) {
      for (const key of Object.keys(value)) {
        if (handledKeys.has(key)) {
          continue
        }
        const entryVal = Reflect.get(value, key)
        result[key] = hasDurabilityBelow(is.type)
          ? projectSynced(is.type, entryVal)
          : entryVal
      }
    }
    return result
  }

  return value
}

/**
 * Re-hydrates a `Synced`-only fold result back into a full valid `Model`,
 * filling `Loaded` and `Ephemeral` fields from `reset()` and `Local` fields
 * from `reset()` or `initialValue`.
 */
export const hydrateFromSynced = <Value>(
  ast: SchemaAST.AST,
  initialValue: unknown,
  syncedValue: unknown,
): Value => {
  if (
    !hasDurabilityBelow(ast) ||
    syncedValue === null ||
    syncedValue === undefined
  ) {
    return typedAs<Value>(syncedValue)
  }
  if (SchemaAST.isSuspend(ast)) {
    return hydrateFromSynced(ast.thunk(), initialValue, syncedValue)
  }
  if (SchemaAST.isUnion(ast)) {
    const maybeSyncedTag = readTag(syncedValue)
    const maybeIndex = taggedUnionIndex(ast)
    if (Option.isSome(maybeIndex) && Option.isSome(maybeSyncedTag)) {
      const memberAst = maybeIndex.value.get(maybeSyncedTag.value)
      if (memberAst !== undefined) {
        const maybeInitTag = readTag(initialValue)
        const matchingInit =
          Option.isSome(maybeInitTag) &&
          maybeInitTag.value === maybeSyncedTag.value
            ? initialValue
            : undefined
        return hydrateFromSynced(memberAst, matchingInit, syncedValue)
      }
    }
    return Option.match(resolveUnionMember(ast, syncedValue), {
      onNone: () => typedAs<Value>(syncedValue),
      onSome: memberAst =>
        hydrateFromSynced(memberAst, initialValue, syncedValue),
    })
  }
  if (isOptionAst(ast)) {
    if (Option.isOption(syncedValue) && Option.isSome(syncedValue)) {
      const maybeInner = Array.head(ast.typeParameters)
      if (Option.isSome(maybeInner)) {
        const initInner =
          Option.isOption(initialValue) && Option.isSome(initialValue)
            ? initialValue.value
            : undefined
        return typedAs<Value>(
          Option.some(
            hydrateFromSynced(maybeInner.value, initInner, syncedValue.value),
          ),
        )
      }
    }
    return typedAs<Value>(syncedValue)
  }
  if (SchemaAST.isArrays(ast)) {
    if (!globalThis.Array.isArray(syncedValue)) {
      return typedAs<Value>(syncedValue)
    }
    const maybeRest = Array.head(ast.rest)
    const initArr = globalThis.Array.isArray(initialValue)
      ? initialValue
      : undefined
    return typedAs<Value>(
      Array.map(syncedValue, (item, index) => {
        const maybeElemAst = Option.orElse(
          Array.get(ast.elements, index),
          () => maybeRest,
        )
        const initItem =
          initArr === undefined
            ? undefined
            : Option.getOrUndefined(Array.get(initArr, index))
        return Option.isSome(maybeElemAst) &&
          hasDurabilityBelow(maybeElemAst.value)
          ? hydrateFromSynced(maybeElemAst.value, initItem, item)
          : item
      }),
    )
  }
  if (SchemaAST.isObjects(ast)) {
    if (!Predicate.isObject(syncedValue)) {
      return typedAs<Value>(syncedValue)
    }
    const initObj = Predicate.isObject(initialValue) ? initialValue : undefined
    const result: Record<string, unknown> = {}
    const handledKeys = new Set<string>()
    for (const ps of ast.propertySignatures) {
      if (!Predicate.isString(ps.name)) {
        continue
      }
      handledKeys.add(ps.name)
      if (ps.name === '_tag') {
        result['_tag'] = Reflect.get(syncedValue, '_tag')
        continue
      }
      const maybeDur = durabilityOf(ps.type)
      if (Option.isSome(maybeDur)) {
        const dur = maybeDur.value
        if (dur.role === 'Synced') {
          const syncedField = Reflect.get(syncedValue, ps.name)
          const initField =
            initObj !== undefined && Object.hasOwn(initObj, ps.name)
              ? Reflect.get(initObj, ps.name)
              : undefined
          result[ps.name] = hasDurabilityBelow(ps.type)
            ? hydrateFromSynced(ps.type, initField, syncedField)
            : syncedField
        } else if (dur.role === 'Loaded' || dur.role === 'Ephemeral') {
          const resetVal = dur.reset()
          if (!(isOptionalKeyAst(ps.type) && resetVal === undefined)) {
            result[ps.name] = resetVal
          }
        } else {
          if (dur.reset !== undefined) {
            const resetVal = dur.reset()
            if (!(isOptionalKeyAst(ps.type) && resetVal === undefined)) {
              result[ps.name] = resetVal
            }
          } else if (initObj !== undefined && Object.hasOwn(initObj, ps.name)) {
            const initField = Reflect.get(initObj, ps.name)
            result[ps.name] = hasDurabilityBelow(ps.type)
              ? stripForSharedSnapshot(ps.type, initField, initField)
              : initField
          } else {
            throw new Error(
              `[foldkit] hydrateFromSynced: local field "${ps.name}" has no initial value and no Program.local(schema, reset) reset thunk`,
            )
          }
        }
      } else {
        const syncedField = Reflect.get(syncedValue, ps.name)
        const initField =
          initObj !== undefined && Object.hasOwn(initObj, ps.name)
            ? Reflect.get(initObj, ps.name)
            : undefined
        result[ps.name] = hasDurabilityBelow(ps.type)
          ? hydrateFromSynced(ps.type, initField, syncedField)
          : syncedField
      }
    }

    for (const is of ast.indexSignatures) {
      for (const key of Object.keys(syncedValue)) {
        if (handledKeys.has(key)) {
          continue
        }
        const entryVal = Reflect.get(syncedValue, key)
        const initEntry =
          initObj !== undefined && Object.hasOwn(initObj, key)
            ? Reflect.get(initObj, key)
            : undefined
        result[key] = hasDurabilityBelow(is.type)
          ? hydrateFromSynced(is.type, initEntry, entryVal)
          : entryVal
      }
    }

    return typedAs<Value>(result)
  }

  return typedAs<Value>(syncedValue)
}

// EXHAUSTIVENESS ASSERTION

const collectDurabilityViolations = (
  ast: SchemaAST.AST,
  path: string,
  visited: Set<SchemaAST.AST>,
  violations: Array<string>,
): void => {
  const unwrapped = unwrapSuspend(ast)
  if (visited.has(unwrapped)) {
    return
  }
  visited.add(unwrapped)

  if (SchemaAST.isUnion(unwrapped)) {
    for (const member of unwrapped.types) {
      collectDurabilityViolations(member, path, visited, violations)
    }
    return
  }
  if (isOptionAst(unwrapped)) {
    const maybeInner = Array.head(unwrapped.typeParameters)
    if (Option.isSome(maybeInner)) {
      collectDurabilityViolations(maybeInner.value, path, visited, violations)
    }
    return
  }
  if (SchemaAST.isArrays(unwrapped)) {
    for (const elem of unwrapped.elements) {
      collectDurabilityViolations(elem, `${path}[]`, visited, violations)
    }
    for (const rest of unwrapped.rest) {
      collectDurabilityViolations(rest, `${path}[]`, visited, violations)
    }
    return
  }
  if (SchemaAST.isObjects(unwrapped)) {
    const isClassified = isDurabilityModelAst(unwrapped)
    for (const ps of unwrapped.propertySignatures) {
      if (!Predicate.isString(ps.name) || ps.name === '_tag') {
        continue
      }
      const fieldPath = path === '' ? ps.name : `${path}.${ps.name}`
      const maybeDur = durabilityOf(ps.type)
      if (isClassified && Option.isNone(maybeDur)) {
        violations.push(`${fieldPath}: missing durability classification`)
        continue
      }
      if (Option.isSome(maybeDur)) {
        const dur = maybeDur.value
        if (dur.role === 'Loaded' || dur.role === 'Ephemeral') {
          const resetValue = dur.reset()
          const isValid =
            (isOptionalKeyAst(ps.type) && resetValue === undefined) ||
            S.is(S.make(ps.type))(resetValue)
          if (!isValid) {
            violations.push(
              `${fieldPath}: reset() value for ${dur.role} field failed Schema validation`,
            )
          }
        } else if (dur.role === 'Local') {
          if (dur.reset !== undefined) {
            const resetValue = dur.reset()
            const isValid =
              (isOptionalKeyAst(ps.type) && resetValue === undefined) ||
              S.is(S.make(ps.type))(resetValue)
            if (!isValid) {
              violations.push(
                `${fieldPath}: reset() value for Local field failed Schema validation`,
              )
            }
          }
          if (hasDurabilityBelow(ps.type)) {
            collectDurabilityViolations(ps.type, fieldPath, visited, violations)
          }
        } else if (hasDurabilityBelow(ps.type)) {
          collectDurabilityViolations(ps.type, fieldPath, visited, violations)
        }
      } else if (hasDurabilityBelow(ps.type)) {
        collectDurabilityViolations(ps.type, fieldPath, visited, violations)
      }
    }
    for (const is of unwrapped.indexSignatures) {
      if (hasDurabilityBelow(is.type)) {
        collectDurabilityViolations(is.type, `${path}[*]`, visited, violations)
      }
    }
  }
}

/**
 * Validates at test time that a Model Schema was constructed with
 * `Program.model(...)`, every classified field carries a durability role, and
 * every `reset()` thunk returns a value accepted by its field Schema.
 *
 * @example
 * ```typescript
 * Program.assertDurabilityExhaustive(BooksModel)
 * ```
 */
export const assertDurabilityExhaustive = (schema: S.Top): void => {
  const ast = unwrapSuspend(schema.ast)
  if (!isDurabilityModelAst(ast)) {
    throw new Error(
      '[foldkit] assertDurabilityExhaustive: root Model Schema must be constructed with Program.model(...)',
    )
  }
  const violations: Array<string> = []
  collectDurabilityViolations(ast, '', new Set(), violations)
  if (Array.isArrayNonEmpty(violations)) {
    throw new Error(
      `[foldkit] assertDurabilityExhaustive failed:\n- ${Array.join(violations, '\n- ')}`,
    )
  }
}
