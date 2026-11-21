import {
  Array,
  type Equivalence,
  Predicate,
  Record,
  Schema,
  Stream,
} from 'effect'

import { mapMessages } from '../command/index.js'
import type {
  AnyDurabilityModel,
  SubscriptionPatch,
} from '../program/durability.js'
import type { ProgramCommand } from '../program/program.js'

type SubscriptionBrand = {
  readonly __subscription: never
}

type DependenciesSchema<Dependencies> = Schema.Schema<Dependencies> & {
  readonly fields: Schema.Struct.Fields
}

/** Runtime provenance carried by a Subscription helper. */
export type SubscriptionSource = Readonly<{
  _tag: 'Port'
  port: unknown
}>

type EntrySource = Readonly<{
  source?: SubscriptionSource
}>

/**
 * Which of a Subscription's Messages a newer one makes pointless. When a
 * Message from this Subscription arrives while the last Message waiting
 * to be taken is an earlier one of its own, and
 * `supersedes(waiting, arrived)` is true, the arrived one takes its
 * place. Nothing is taken out of the order it arrived in. A stream of
 * states, such as a clock's ticks or a player's place, says so; a device
 * that falls behind then holds one of them, never seconds of stale ones,
 * and what a person pressed is taken next. Events that must each be
 * taken, such as an end or a failure, answer false.
 *
 * @example
 * ```typescript
 * supersedes: (waiting, arrived) =>
 *   waiting._tag === 'ReachedPlace' && arrived._tag === 'ReachedPlace'
 * ```
 */
export type Superseding<Message> = {
  // NOTE: Written as a method so an entry for some of a Program's
  // Messages is still an entry for all of them, as its stream is.
  supersedes?(waiting: Message, arrived: Message): boolean
}

/**
 * The entry shape produced by helpers like `Subscription.persistent` and
 * `Port.subscription` before branding. Pass values of this shape into
 * `Subscription.make` as entry values.
 */
export type EntryWithoutKeepAlive<Model, Message, Dependencies, Services> = {
  readonly dependenciesSchema: DependenciesSchema<Dependencies>
  readonly modelToDependencies: (model: Model) => Dependencies
  readonly keepAliveEquivalence?: never
  readonly dependenciesToStream: (
    dependencies: Dependencies,
  ) => Stream.Stream<Message, never, Services>
} & EntrySource &
  Superseding<Message>

type EntryWithKeepAlive<Model, Message, Dependencies, Services> = {
  readonly dependenciesSchema: DependenciesSchema<Dependencies>
  readonly modelToDependencies: (model: Model) => Dependencies
  readonly keepAliveEquivalence: Equivalence.Equivalence<Dependencies>
  readonly dependenciesToStream: (
    dependencies: Dependencies,
    readDependencies: () => Dependencies,
  ) => Stream.Stream<Message, never, Services>
} & EntrySource &
  Superseding<Message>

type Entry<Model, Message, Dependencies, Services = never> =
  | EntryWithoutKeepAlive<Model, Message, Dependencies, Services>
  | EntryWithKeepAlive<Model, Message, Dependencies, Services>

/**
 * A single subscription entry produced by `Subscription.make`,
 * `Subscription.lift`, or `Subscription.aggregate`. The brand field is
 * `never`, so application code cannot manually construct a `Subscription`
 * value: it must go through one of those constructors (or a helper like
 * `Subscription.persistent` that returns an entry shape, then through
 * `make`).
 *
 * Two variants by `keepAliveEquivalence` presence:
 *
 * - Without `keepAliveEquivalence` (the common case), every Model change recomputes
 *   the dependencies. Equivalent dependencies leave the Stream alone; any
 *   change tears it down and restarts. `dependenciesToStream` takes a single
 *   argument: the latest dependencies.
 * - With `keepAliveEquivalence` (an escape hatch), Model changes that the
 *   equivalence treats as equal leave the Stream running, but the running
 *   Stream can still read the latest dependencies via the second
 *   `readDependencies` argument. Use this when the Stream needs mid-flight
 *   access to data that changes often but shouldn't trigger restarts
 *   (Foldkit UI's `DragAndDrop.autoScroll` reading the latest pointer
 *   `clientY` each rAF tick is the canonical example).
 *
 * `dependenciesSchema` must be a `Schema.Struct` so every dependency is
 * explicitly named at the schema level.
 */
export type Subscription<
  Model,
  Message,
  Dependencies,
  Services = never,
> = Entry<Model, Message, Dependencies, Services> & SubscriptionBrand

/** A record of named Subscriptions keyed by dependency field name. */
export type Subscriptions<Model, Message, Services = never> = Readonly<
  Record<string, Subscription<Model, Message, any, Services>>
>

/**
 * Callbacks for a subscription entry without `keepAliveEquivalence`. Dependencies
 * are inferred from the field map passed to `entry`.
 */
type EntryCallbacksWithoutKeepAlive<Model, Message, Dependencies, Services> = {
  readonly modelToDependencies: (model: Model) => Dependencies
  readonly keepAliveEquivalence?: never
  readonly dependenciesToStream: (
    dependencies: Dependencies,
  ) => Stream.Stream<Message, never, Services>
} & Superseding<Message>

/**
 * Callbacks for a subscription entry with `keepAliveEquivalence`. Dependencies
 * are inferred from the field map passed to `entry`.
 */
type EntryCallbacksWithKeepAlive<Model, Message, Dependencies, Services> = {
  readonly modelToDependencies: (model: Model) => Dependencies
  readonly keepAliveEquivalence: Equivalence.Equivalence<Dependencies>
  readonly dependenciesToStream: (
    dependencies: Dependencies,
    readDependencies: () => Dependencies,
  ) => Stream.Stream<Message, never, Services>
} & Superseding<Message>

/**
 * Builds a single subscription entry from a field map and callbacks.
 *
 * The field map is the same shape you would pass to `S.Struct`. Reading the
 * schema as a positional argument (rather than a property on the entry
 * literal) lets TypeScript fully resolve the `Dependencies` type before
 * contextually typing `modelToDependencies` and `dependenciesToStream`, so
 * destructuring patterns like `({ maybeMapHostId })` are inferred correctly
 * even when the field schemas use transforms (e.g. `S.Option`).
 *
 * Two overloads, one per `keepAliveEquivalence` presence:
 *
 * - Without `keepAliveEquivalence`, `dependenciesToStream` takes a single
 *   `dependencies` argument.
 * - With `keepAliveEquivalence`, `dependenciesToStream` also receives a
 *   `readDependencies` thunk for accessing the latest value while the Stream
 *   stays running across Model changes the equivalence accepts as equal.
 */
export type EntryBuilder<Model, Message, Services> = <
  const Fields extends Schema.Struct.Fields,
  Callbacks extends
    | EntryCallbacksWithoutKeepAlive<
        Model,
        Message,
        Schema.Struct.Type<Fields>,
        Services
      >
    | EntryCallbacksWithKeepAlive<
        Model,
        Message,
        Schema.Struct.Type<Fields>,
        Services
      >,
>(
  fields: Fields,
  callbacks: Callbacks,
) => Callbacks extends {
  readonly keepAliveEquivalence: Equivalence.Equivalence<any>
}
  ? EntryWithKeepAlive<Model, Message, Schema.Struct.Type<Fields>, Services>
  : EntryWithoutKeepAlive<Model, Message, Schema.Struct.Type<Fields>, Services>

/**
 * Declares a Subscriptions record. The Model, Message, and optional Services
 * generics are provided up front; the entries record follows, built from
 * calls to the `entry` builder passed into the inner function.
 *
 * Reach for `Subscription.aggregate` to combine multiple records, and
 * `Subscription.lift` to translate a child Submodel's record into a parent
 * context.
 *
 * @example
 * ```ts
 * Subscription.make<Model, Message>()(entry => ({
 *   tick: entry(
 *     { isRunning: S.Boolean },
 *     {
 *       modelToDependencies: model => ({ isRunning: model.isRunning }),
 *       dependenciesToStream: ({ isRunning }) =>
 *         Stream.when(..., Effect.sync(() => isRunning)),
 *     },
 *   ),
 * }))
 * ```
 */
export const make =
  <Model, Message, Services = never>() =>
  <
    Entries extends Readonly<
      Record<string, Entry<Model, Message, any, Services>>
    >,
  >(
    build: (entry: EntryBuilder<Model, Message, Services>) => Entries,
  ): {
    readonly [K in keyof Entries]: Entries[K] & SubscriptionBrand
  } => {
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    const entryBuilder = ((
      fields: Schema.Struct.Fields,
      callbacks: Record<string, unknown>,
    ) => ({
      dependenciesSchema: Schema.Struct(fields),
      ...callbacks,
    })) as unknown as EntryBuilder<Model, Message, Services>
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    return build(entryBuilder) as any
  }

/**
 * Combines multiple Subscriptions records into one. Throws on duplicate
 * keys so a misconfigured aggregate fails loudly at startup rather than
 * silently overriding.
 */
export const aggregate =
  <Model, Message, Services = never>() =>
  (
    ...records: ReadonlyArray<Subscriptions<Model, Message, Services>>
  ): Subscriptions<Model, Message, Services> => {
    const result: Record<
      string,
      Subscription<Model, Message, any, Services>
    > = {}
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (Object.hasOwn(result, key)) {
          throw new Error(
            `Subscription.aggregate: duplicate key "${key}" across records`,
          )
        }
        result[key] = record[key]!
      }
    }
    return result
  }

/**
 * Wraps a Stream as a Subscription entry whose lifecycle is independent of
 * the Model. The Stream runs for the lifetime of the Subscriptions record;
 * no Model change tears it down or restarts it. Use for any Stream whose
 * work doesn't depend on Model state, such as system theme listeners,
 * viewport width observers, or route-independent timers.
 *
 * Returns an entry shape, not a branded Subscription. Pass it into `make`
 * as an entry value.
 */
export const persistent = <Message, Services = never>(
  stream: Stream.Stream<Message, never, Services>,
): EntryWithoutKeepAlive<
  unknown,
  Message,
  Record<string, never>,
  Services
> => ({
  dependenciesSchema: Schema.Struct({}),
  modelToDependencies: () => ({}),
  dependenciesToStream: () => stream,
})

type ChildModelOf<ChildSubscriptions> =
  ChildSubscriptions[keyof ChildSubscriptions] extends Subscription<
    infer ChildModel,
    any,
    any,
    any
  >
    ? ChildModel
    : never

type ChildMessageOf<ChildSubscriptions> =
  ChildSubscriptions[keyof ChildSubscriptions] extends Subscription<
    any,
    infer ChildMessage,
    any,
    any
  >
    ? ChildMessage
    : never

/**
 * Memoizes a pure parent-to-child Model projection by parent Model identity
 * across sibling lifted Subscriptions so a lift with N entries computes the
 * child Model once per parent Model object or function. Primitive parent
 * Models are read directly on each call.
 */
export const shareParentModelProjection = <ParentModel, ChildModel>(
  read: (parentModel: ParentModel) => ChildModel,
): ((parentModel: ParentModel) => ChildModel) => {
  const cache = new WeakMap<object, ChildModel>()

  return parentModel => {
    if (Predicate.isObjectKeyword(parentModel)) {
      if (cache.has(parentModel)) {
        return cache.get(parentModel)!
      }
      const childModel = read(parentModel)
      cache.set(parentModel, childModel)
      return childModel
    } else {
      return read(parentModel)
    }
  }
}

/**
 * Lifts a record of child Subscriptions into a parent's Model and Message
 * context, applying a Model accessor and a Message wrapper uniformly to
 * every entry. Per-entry dependency types, schemas, and `keepAliveEquivalence`
 * settings are preserved; each lifted entry's variant (with or without
 * `readDependencies`) matches its source entry's.
 *
 * Entries that read the same parent Model object or function share one
 * `toChildModel` result. Primitive parent Models are read separately for each
 * entry. Keep `toChildModel` a pure projection of the parent Model.
 */
export const lift =
  <
    Subscriptions extends Readonly<
      Record<string, Subscription<any, any, any, any>>
    >,
  >(
    subscriptions: Subscriptions,
  ) =>
  <ParentModel, ParentMessage>(config: {
    readonly toChildModel: (
      parentModel: ParentModel,
    ) => ChildModelOf<Subscriptions>
    readonly toParentMessage: (
      message: ChildMessageOf<Subscriptions>,
    ) => ParentMessage
  }): {
    readonly [K in keyof Subscriptions]: Subscriptions[K] extends Subscription<
      any,
      any,
      infer Dependencies,
      infer Services
    >
      ? Subscription<ParentModel, ParentMessage, Dependencies, Services>
      : never
  } => {
    const readChildModel = shareParentModelProjection(config.toChildModel)

    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    return Record.map(subscriptions, subscription => {
      const modelToDependencies = (parentModel: ParentModel) =>
        subscription.modelToDependencies(readChildModel(parentModel))

      // NOTE: The child says which of its own Messages a newer one makes
      // pointless. The parent's queue holds the wrapped Messages, so each
      // wrapped Message remembers the child Message it was made from, and
      // the child's answer is asked of those.
      const childOf = new WeakMap<object, unknown>()
      const wrapStream = (stream: Stream.Stream<any, never, any>) =>
        Stream.map(stream, (message: any): ParentMessage => {
          const wrapped = (
            config.toParentMessage as (message: any) => ParentMessage
          )(message)
          if (typeof wrapped === 'object' && wrapped !== null) {
            childOf.set(wrapped, message)
          }
          return wrapped
        })
      const childSupersedes = subscription.supersedes
      const superseding =
        childSupersedes === undefined
          ? {}
          : {
              supersedes: (waiting: any, arrived: any): boolean =>
                childOf.has(waiting) &&
                childOf.has(arrived) &&
                childSupersedes(childOf.get(waiting), childOf.get(arrived)),
            }

      if (subscription.keepAliveEquivalence !== undefined) {
        return {
          dependenciesSchema: subscription.dependenciesSchema,
          modelToDependencies,
          keepAliveEquivalence: subscription.keepAliveEquivalence,
          dependenciesToStream: (
            dependencies: any,
            readDependencies: () => any,
          ) =>
            wrapStream(
              subscription.dependenciesToStream(dependencies, readDependencies),
            ),
          ...superseding,
          ...(subscription.source === undefined
            ? {}
            : { source: subscription.source }),
        }
      }

      return {
        dependenciesSchema: subscription.dependenciesSchema,
        modelToDependencies,
        dependenciesToStream: (dependencies: any) =>
          wrapStream(subscription.dependenciesToStream(dependencies)),
        ...superseding,
        ...(subscription.source === undefined
          ? {}
          : { source: subscription.source }),
      }
    }) as any
  }
/* eslint-enable @typescript-eslint/consistent-type-assertions */

// SCOPED SUBSCRIPTIONS (DURABILITY-ENFORCED)

/** A fact Schema whose decoded Type belongs to `Message`. */
export type FactSchema<Message extends Readonly<{ _tag: string }>> =
  Schema.Codec<Message, unknown, never, never>

/**
 * Return type of a durability-enforced Subscription's `apply(model, fact)`
 * reducer: either a `SubscriptionPatch` or a `[patch, commands]` pair.
 */
export type ScopedApplyReturn<
  ModelSchema extends AnyDurabilityModel,
  Message,
  Services = never,
> =
  | SubscriptionPatch<ModelSchema>
  | readonly [
      SubscriptionPatch<ModelSchema>,
      ReadonlyArray<ProgramCommand<Message, Services>>,
    ]

type ScopedEntryCallbacksWithoutKeepAlive<
  ModelSchema extends AnyDurabilityModel,
  Facts extends ReadonlyArray<FactSchema<any>>,
  Message extends Readonly<{ _tag: string }>,
  Dependencies,
  Services,
> = {
  readonly facts: Facts
  readonly modelToDependencies: (model: ModelSchema['Type']) => Dependencies
  readonly keepAliveEquivalence?: never
  readonly dependenciesToStream: (
    dependencies: Dependencies,
  ) => Stream.Stream<NoInfer<Facts[number]['Type']>, never, Services>
  readonly apply: (
    model: ModelSchema['Type'],
    fact: NoInfer<Facts[number]['Type']>,
  ) => ScopedApplyReturn<ModelSchema, Message, Services>
} & Superseding<NoInfer<Facts[number]['Type']>>

type ScopedEntryCallbacksWithKeepAlive<
  ModelSchema extends AnyDurabilityModel,
  Facts extends ReadonlyArray<FactSchema<any>>,
  Message extends Readonly<{ _tag: string }>,
  Dependencies,
  Services,
> = {
  readonly facts: Facts
  readonly modelToDependencies: (model: ModelSchema['Type']) => Dependencies
  readonly keepAliveEquivalence: Equivalence.Equivalence<Dependencies>
  readonly dependenciesToStream: (
    dependencies: Dependencies,
    readDependencies: () => Dependencies,
  ) => Stream.Stream<NoInfer<Facts[number]['Type']>, never, Services>
  readonly apply: (
    model: ModelSchema['Type'],
    fact: NoInfer<Facts[number]['Type']>,
  ) => ScopedApplyReturn<ModelSchema, Message, Services>
} & Superseding<NoInfer<Facts[number]['Type']>>

type ScopedEntryMeta<
  ModelSchema extends AnyDurabilityModel,
  Fact extends Readonly<{ _tag: string }>,
  Message extends Readonly<{ _tag: string }>,
  Services,
> = {
  readonly facts: ReadonlyArray<FactSchema<Fact>>
  readonly apply: (
    model: ModelSchema['Type'],
    fact: Fact,
  ) => ScopedApplyReturn<ModelSchema, Message, Services>
  readonly '~foldkit/ScopedSubscription': Readonly<{
    readonly modelSchema: ModelSchema
    readonly fact: Fact
  }>
}

type ScopedEntryWithoutKeepAlive<
  ModelSchema extends AnyDurabilityModel,
  Fact extends Readonly<{ _tag: string }>,
  Message extends Readonly<{ _tag: string }>,
  Dependencies,
  Services,
> = EntryWithoutKeepAlive<ModelSchema['Type'], Fact, Dependencies, Services> &
  ScopedEntryMeta<ModelSchema, Fact, Message, Services>

type ScopedEntryWithKeepAlive<
  ModelSchema extends AnyDurabilityModel,
  Fact extends Readonly<{ _tag: string }>,
  Message extends Readonly<{ _tag: string }>,
  Dependencies,
  Services,
> = EntryWithKeepAlive<ModelSchema['Type'], Fact, Dependencies, Services> &
  ScopedEntryMeta<ModelSchema, Fact, Message, Services>

/** A single durability-enforced Subscription entry before branding. */
export type ScopedEntry<
  ModelSchema extends AnyDurabilityModel,
  Fact extends Readonly<{ _tag: string }>,
  Message extends Readonly<{ _tag: string }>,
  Dependencies,
  Services = never,
> =
  | ScopedEntryWithoutKeepAlive<
      ModelSchema,
      Fact,
      Message,
      Dependencies,
      Services
    >
  | ScopedEntryWithKeepAlive<ModelSchema, Fact, Message, Dependencies, Services>

/** A branded durability-enforced Subscription entry. */
export type ScopedSubscription<
  ModelSchema extends AnyDurabilityModel,
  Fact extends Readonly<{ _tag: string }>,
  Message extends Readonly<{ _tag: string }>,
  Dependencies,
  Services = never,
> = ScopedEntry<ModelSchema, Fact, Message, Dependencies, Services> &
  SubscriptionBrand

/** A record of durability-enforced Subscriptions bound to `ModelSchema`. */
export type ScopedSubscriptions<
  ModelSchema extends AnyDurabilityModel,
  Facts extends Readonly<{ _tag: string }>,
  Message extends Readonly<{ _tag: string }>,
  Services = never,
> = Readonly<
  Record<string, Subscription<ModelSchema['Type'], Message, any, Services>>
> &
  Readonly<{
    readonly '~foldkit/ScopedSubscriptions': Readonly<{
      readonly modelSchema: ModelSchema
      readonly facts: Facts
    }>
  }>

/** Extracts the union of all declared fact types from a record of scoped entries. */
export type SubscriptionFactsOf<Entries> =
  Entries extends Readonly<{
    readonly '~foldkit/ScopedSubscriptions': Readonly<{
      readonly facts: infer Facts
    }>
  }>
    ? Facts
    : {
        [K in keyof Entries]: Entries[K] extends Readonly<{
          readonly '~foldkit/ScopedSubscription': Readonly<{
            readonly fact: infer Fact
          }>
        }>
          ? Fact
          : never
      }[keyof Entries]

/** Entry builder passed to `Subscription.forModel(Model)<Message, Services>()`. */
export type ScopedEntryBuilder<
  ModelSchema extends AnyDurabilityModel,
  Message extends Readonly<{ _tag: string }>,
  Services,
> = {
  <
    const Fields extends Schema.Struct.Fields,
    const Facts extends ReadonlyArray<FactSchema<Message>>,
  >(
    fields: Fields,
    callbacks: ScopedEntryCallbacksWithoutKeepAlive<
      ModelSchema,
      Facts,
      Message,
      Schema.Struct.Type<Fields>,
      Services
    >,
  ): ScopedEntryWithoutKeepAlive<
    ModelSchema,
    Facts[number]['Type'],
    Message,
    Schema.Struct.Type<Fields>,
    Services
  >
  <
    const Fields extends Schema.Struct.Fields,
    const Facts extends ReadonlyArray<FactSchema<Message>>,
  >(
    fields: Fields,
    callbacks: ScopedEntryCallbacksWithKeepAlive<
      ModelSchema,
      Facts,
      Message,
      Schema.Struct.Type<Fields>,
      Services
    >,
  ): ScopedEntryWithKeepAlive<
    ModelSchema,
    Facts[number]['Type'],
    Message,
    Schema.Struct.Type<Fields>,
    Services
  >
}

/**
 * Declares durability-enforced Subscriptions bound to a `DurabilityModel`.
 * Each entry declares its emitted `facts` and its `apply(model, fact)` reducer
 * returning a `SubscriptionPatch<typeof Model>` that can write only `loaded`
 * and `ephemeral` fields.
 *
 * @example
 * ```typescript
 * const subscriptions = Subscription.forModel(Model)<Message, Services>()(
 *   entry => ({
 *     shelf: entry(
 *       {},
 *       {
 *         facts: [ReceivedShelf, FailedReadShelf],
 *         modelToDependencies: () => ({}),
 *         dependenciesToStream: () => shelfStream,
 *         apply: (_model, fact) => ({ library: ShelfReady({ shelf: fact.shelf }) }),
 *       },
 *     ),
 *   }),
 * )
 * ```
 */
export const forModel =
  <ModelSchema extends AnyDurabilityModel>(_model: ModelSchema) =>
  <Message extends Readonly<{ _tag: string }>, Services = never>() =>
  <
    Entries extends Readonly<
      Record<string, ScopedEntry<ModelSchema, any, Message, any, Services>>
    >,
  >(
    build: (
      entry: ScopedEntryBuilder<ModelSchema, Message, Services>,
    ) => Entries,
  ): ScopedSubscriptions<
    ModelSchema,
    SubscriptionFactsOf<Entries>,
    Message,
    Services
  > => {
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    const entryBuilder = ((
      fields: Schema.Struct.Fields,
      callbacks: Record<string, unknown>,
    ) => ({
      dependenciesSchema: Schema.Struct(fields),
      ...callbacks,
    })) as unknown as ScopedEntryBuilder<ModelSchema, Message, Services>
    return build(entryBuilder) as any
    /* eslint-enable @typescript-eslint/consistent-type-assertions */
  }

type ScopedRecordsFactsOf<
  Records extends ReadonlyArray<ScopedSubscriptions<any, any, any, any>>,
> = Records[number] extends infer Item
  ? Item extends ScopedSubscriptions<any, infer Facts, any, any>
    ? Facts
    : never
  : never

/**
 * Combines multiple `ScopedSubscriptions` records for the same `DurabilityModel`,
 * preserving the union of their declared `Facts` and throwing on duplicate keys.
 */
export const aggregateForModel =
  <ModelSchema extends AnyDurabilityModel>(_model: ModelSchema) =>
  <Message extends Readonly<{ _tag: string }>, Services = never>() =>
  <
    const Records extends ReadonlyArray<
      ScopedSubscriptions<ModelSchema, any, Message, Services>
    >,
  >(
    ...records: Records
  ): ScopedSubscriptions<
    ModelSchema,
    ScopedRecordsFactsOf<Records>,
    Message,
    Services
  > => {
    const result: Record<
      string,
      Subscription<ModelSchema['Type'], Message, any, Services>
    > = {}
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (Object.hasOwn(result, key)) {
          throw new Error(
            `Subscription.aggregateForModel: duplicate key "${key}" across records`,
          )
        }
        result[key] = record[key]!
      }
    }
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    return result as unknown as ScopedSubscriptions<
      ModelSchema,
      ScopedRecordsFactsOf<Records>,
      Message,
      Services
    >
  }

/**
 * Lifts a child `DurabilityModel`'s `ScopedSubscriptions` into a parent
 * `DurabilityModel` by mapping `ChildPatch` to `ParentPatch` through a typed
 * `toParentPatch` function.
 */
export const liftScoped =
  <
    ChildModelSchema extends AnyDurabilityModel,
    ChildFacts extends Readonly<{ _tag: string }>,
    ChildMessage extends Readonly<{ _tag: string }>,
    Services = never,
  >(
    subscriptions: ScopedSubscriptions<
      ChildModelSchema,
      ChildFacts,
      ChildMessage,
      Services
    >,
  ) =>
  <
    ParentModelSchema extends AnyDurabilityModel,
    ParentMessage extends Readonly<{ _tag: string }>,
  >(
    _parentModel: ParentModelSchema,
    config: {
      readonly toChildModel: (
        parentModel: ParentModelSchema['Type'],
      ) => ChildModelSchema['Type']
      readonly toParentMessage: (message: ChildMessage) => ParentMessage
      readonly toParentPatch: (
        patch: SubscriptionPatch<ChildModelSchema>,
      ) => SubscriptionPatch<ParentModelSchema>
    },
  ): ScopedSubscriptions<
    ParentModelSchema,
    ChildFacts,
    ParentMessage,
    Services
  > => {
    const readChildModel = shareParentModelProjection(config.toChildModel)
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    const entries = subscriptions as unknown as Readonly<
      Record<
        string,
        ScopedSubscription<
          ChildModelSchema,
          ChildFacts,
          ChildMessage,
          any,
          Services
        >
      >
    >
    return Record.map(entries, subscription => {
      const modelToDependencies = (parentModel: ParentModelSchema['Type']) =>
        subscription.modelToDependencies(readChildModel(parentModel))
      const apply = (
        parentModel: ParentModelSchema['Type'],
        fact: ChildFacts,
      ): ScopedApplyReturn<ParentModelSchema, ParentMessage, Services> => {
        const applied = subscription.apply(readChildModel(parentModel), fact)
        if (Array.isArray(applied)) {
          const [childPatch, childCommands] = applied as readonly [
            SubscriptionPatch<ChildModelSchema>,
            ReadonlyArray<ProgramCommand<ChildMessage, Services>>,
          ]
          return [
            config.toParentPatch(childPatch),
            mapMessages(childCommands, config.toParentMessage),
          ]
        }
        return config.toParentPatch(
          applied as SubscriptionPatch<ChildModelSchema>,
        )
      }
      return {
        ...subscription,
        modelToDependencies,
        apply,
      }
    }) as unknown as ScopedSubscriptions<
      ParentModelSchema,
      ChildFacts,
      ParentMessage,
      Services
    >
    /* eslint-enable @typescript-eslint/consistent-type-assertions */
  }

/** Runtime shape of a scoped Subscription entry inspected by `Program.make`. */
export type RuntimeScopedEntry = Readonly<{
  facts: ReadonlyArray<Schema.Top>
  apply: (model: any, fact: any) => unknown
}>

/** True when a Subscription entry carries scoped `facts` and `apply` metadata. */
export const isRuntimeScopedEntry = (
  entry: unknown,
): entry is RuntimeScopedEntry =>
  Predicate.isObject(entry) &&
  Predicate.hasProperty(entry, 'facts') &&
  Array.isArray(entry.facts) &&
  Predicate.hasProperty(entry, 'apply') &&
  typeof entry.apply === 'function'
