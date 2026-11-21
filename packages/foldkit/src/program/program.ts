import {
  Array,
  type Effect,
  Predicate,
  Record,
  type Schema,
  SchemaAST,
} from 'effect'

import type { Sync } from '../behavior/pace.js'
import type { AnyCatalog } from '../catalog/catalog.js'
import type { EffectManifest } from '../command/effectManifest.js'
import {
  type ProgramInteraction,
  fromCatalog,
} from '../interaction/interaction.js'
import type { ManagedResources } from '../managedResource/managedResource.js'
import type { ProgramNavigation as Navigation } from '../navigation/declaration.js'
import type { Ports } from '../port/port.js'
import type { UiNode } from '../renderers/types.js'
import type { ActionContext } from '../schema/index.js'
import {
  type RuntimeScopedEntry,
  type ScopedSubscriptions,
  type Subscriptions,
  isRuntimeScopedEntry,
} from '../subscription/subscription.js'
import type {
  MessageCategory,
  SessionPolicy,
} from '../synchronization/synchronization.js'
import {
  type AnyDurabilityModel,
  type DurabilityTypeId,
  type SyncedOfSchema,
  applySubscriptionPatch,
  isDurabilityModelAst,
  mergeOnRefold,
} from './durability.js'
import type { VersionedEventRegistry } from './versionedEvent.js'

/** One Action projected from Program.valid for the current Model. */
export type ProgramValidAction = Readonly<{
  token: string
  keys: ReadonlyArray<string>
  spoken: ReadonlyArray<string>
  valid: boolean
  hidden?: string
}>

/** Projects the valid Action tree from Model. This is not a CLI flag. */
export type ProgramValid<Model> = (
  model: Model,
  context?: ActionContext,
) => ReadonlyArray<ProgramValidAction>

/** Builds the host-neutral screen tree from Model. Clients paint this tree. */
export type ProgramScreen<Model> = (
  model: Model,
  context?: ActionContext,
) => UiNode

/** A Schema usable by a portable Foldkit Program without codec services. */
export type ProgramSchema<Value> = Schema.Codec<Value, unknown, never, never>

/** A migration between two encoded Program tape versions. */
export type Migration = Readonly<{
  fromVersion: number
  toVersion: number
  migrate: (encodedTape: Schema.Json) => Schema.Json
}>

/** A named Program effect that produces one Message. */
export type ProgramCommand<Message, Resources = never> = Readonly<{
  name: string
  args?: Record<string, unknown>
  key?: string
  effectManifest?: EffectManifest
  effect: Effect.Effect<Message, never, Resources>
}>

/** Pure synced-only log fold used for shared snapshots and stranger-viewpoint folds. */
export type SyncedFold<SyncedModel, Message> = (
  model: SyncedModel,
  message: Message,
) => SyncedModel

/** Program-owned classification and domain projection for synchronized sessions. */
export type ProgramSynchronization<
  Model,
  Message,
  SyncedModel = Model,
  SyncedFoldMessage = Message,
> = Readonly<{
  messageCategory: (message: Message) => MessageCategory
  projectDomain: (model: Model) => unknown
  /**
   * Pure fold over only the `synced` fields of the Model (`SyncedOfSchema<typeof Model>`).
   * Used by `Runtime.start` for `strangerViewpoint` folds and shared-snapshot audits so
   * shared folds can never depend on `local`, `loaded`, or `ephemeral` state.
   */
  foldSynced?: SyncedFold<SyncedModel, SyncedFoldMessage>
  /**
   * The session policy the Model holds, for a Program that keeps it as
   * state (see `Session.compose`). Every Processor folds the same session
   * rows, so every Processor reads the same policy at the same log
   * position, and a Message's audience follows the policy in force there.
   */
  sessionPolicyOf?: (model: Model) => SessionPolicy
  /**
   * The Processors that keep their own navigation whatever the session's
   * mode, by the `from` they write, such as `cli-4f2a9c1e` for a terminal
   * that plays in the background: Navigation Messages they write apply
   * only to them, and they apply no one else's. Every Processor reads the
   * same `from`, so every Processor folds the same rows the same way.
   */
  keepsOwnNavigation?: (processorId: string) => boolean
  /**
   * What a Program keeps when sync refolds its log: the part of the Model
   * that never came from the log, such as a library read from its own
   * tables or the place a player reached second by second. `refolded` is
   * the Model the log folds to; the result replaces it.
   *
   * @example
   * ```typescript
   * keepOnRefold: (current, refolded) => ({ ...refolded, library: current.library })
   * ```
   */
  keepOnRefold?: (current: Model, refolded: Model) => Model
  /**
   * Projects the live Ready Model into what this device keeps across a
   * force-close and restart. Unlike `projectDomain`, this keeps device-local
   * state such as the open screen, cached library shelf, and appearance,
   * while letting a Program quiet active side effects (for example, pausing
   * an audio player so reopening never starts sound on its own).
   *
   * @example
   * ```typescript
   * projectLocal: model => ({ ...model, listening: pause(model.listening) })
   * ```
   */
  projectLocal?: (model: Model) => Model
  /**
   * True for a Message only the Processor that sends it applies. Sync
   * never writes it to the log, so no other Processor receives it and no
   * refold replays it, and a row with that Message from another writer is
   * never applied, live or in a fold. Use it for what must not leave the
   * device, such as a sign-in address pasted into a field, and keep what
   * it changed with `keepOnRefold`.
   *
   * @example
   * ```typescript
   * isLocalOnly: message => message._tag === 'ConnectAudible'
   * // ConnectAudible({ address }) updates this Processor; the log never holds the address
   * ```
   */
  isLocalOnly?: (message: Message) => boolean
  /**
   * How a Message reaches the log, for whoever writes it: at once, when
   * its input settles, or sampled. A Program that composes parts gets
   * this derived from what each Message declares; a Message with no word
   * is synced at once. The pure rule a writer runs is `Pace.due`.
   *
   * @example
   * ```typescript
   * paceOf: message => message._tag === 'Typed' ? Settled({ afterMs: 200 }) : Synced()
   * // five keystrokes in a burst are one row, 200 ms after the last
   * ```
   */
  paceOf?: (message: Message) => Sync
}>

/**
 * The destinations a Program can present and how they print. See
 * `Navigation.ProgramNavigation`.
 *
 * @example
 * ```typescript
 * const Counter = ts('Counter')
 * const navigation = { slug: Slug.make('counter'), Destination: Counter, root: Counter() }
 * ```
 */
export type ProgramNavigation<Model, Destination> = Navigation<
  Model,
  Destination
>

/**
 * A renderer-free Foldkit Program.
 *
 * The Program owns the Model, Message protocol, init, update, valid, and
 * screen tree. Clients paint the screen tree. Replay uses update, valid, and
 * screen. Platform Layers, URI carriers, and launch behavior belong to clients.
 */
export type Program<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  id: string
  version: number
  Model: ProgramSchema<Model>
  Message: ProgramSchema<Message>
  init: () => readonly [
    Model,
    ReadonlyArray<
      ProgramCommand<Message, Resources | NoInfer<ManagedResourceServices>>
    >,
  ]
  restore?: (
    model: Model,
  ) => readonly [
    Model,
    ReadonlyArray<
      ProgramCommand<Message, Resources | NoInfer<ManagedResourceServices>>
    >,
  ]
  update: (
    model: Model,
    message: Message,
  ) => readonly [
    Model,
    ReadonlyArray<
      ProgramCommand<Message, Resources | NoInfer<ManagedResourceServices>>
    >,
  ]
  subscriptions?: Subscriptions<
    Model,
    Message,
    Resources | NoInfer<ManagedResourceServices>
  >
  managedResources?: ManagedResources<Model, Message, ManagedResourceServices>
  ports?: P
  migrations?: ReadonlyArray<Migration>
  synchronization?: ProgramSynchronization<Model, Message, any, any>
  versionedEvents?: VersionedEventRegistry<Message>
  /** @deprecated Declare a `catalog`; its entries carry availability. */
  valid?: ProgramValid<Model>
  screen?: ProgramScreen<Model>
  catalog?: AnyCatalog
  interaction?: ProgramInteraction<Model, Message>
  navigation?: ProgramNavigation<Model, any>
}>

type NonDurabilitySchema<Model> = ProgramSchema<Model> &
  Readonly<{ readonly [DurabilityTypeId]?: never }>

type DurabilityProgramConfig<
  ModelSchema extends AnyDurabilityModel,
  Message extends Readonly<{ _tag: string }>,
  SubscriptionFacts extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices,
  P extends Ports | undefined,
> = Readonly<{
  id: string
  version: number
  Model: ModelSchema
  Message: ProgramSchema<Message>
  init: () => readonly [
    ModelSchema['Type'],
    ReadonlyArray<
      ProgramCommand<Message, Resources | NoInfer<ManagedResourceServices>>
    >,
  ]
  restore?: (
    model: ModelSchema['Type'],
  ) => readonly [
    ModelSchema['Type'],
    ReadonlyArray<
      ProgramCommand<Message, Resources | NoInfer<ManagedResourceServices>>
    >,
  ]
  update: (
    model: ModelSchema['Type'],
    message: Exclude<Message, SubscriptionFacts>,
  ) => readonly [
    ModelSchema['Type'],
    ReadonlyArray<
      ProgramCommand<Message, Resources | NoInfer<ManagedResourceServices>>
    >,
  ]
  subscriptions?: ScopedSubscriptions<
    ModelSchema,
    SubscriptionFacts,
    Message,
    Resources | NoInfer<ManagedResourceServices>
  >
  managedResources?: ManagedResources<
    ModelSchema['Type'],
    Message,
    ManagedResourceServices
  >
  ports?: P
  migrations?: ReadonlyArray<Migration>
  synchronization?: ProgramSynchronization<
    ModelSchema['Type'],
    Message,
    SyncedOfSchema<ModelSchema>,
    Exclude<Message, SubscriptionFacts>
  >
  versionedEvents?: VersionedEventRegistry<Message>
  /** @deprecated Declare a `catalog`; its entries carry availability. */
  valid?: ProgramValid<ModelSchema['Type']>
  screen?: ProgramScreen<ModelSchema['Type']>
  catalog?: AnyCatalog
  interaction?: ProgramInteraction<ModelSchema['Type'], Message>
  navigation?: ProgramNavigation<ModelSchema['Type'], any>
}>

const factTagsOfAst = (ast: SchemaAST.AST): ReadonlyArray<string> => {
  if (SchemaAST.isSuspend(ast)) {
    return factTagsOfAst(ast.thunk())
  }
  if (SchemaAST.isUnion(ast)) {
    return Array.flatMap(ast.types, factTagsOfAst)
  }
  if (SchemaAST.isObjects(ast)) {
    for (const ps of ast.propertySignatures) {
      if (
        ps.name === '_tag' &&
        SchemaAST.isLiteral(ps.type) &&
        Predicate.isString(ps.type.literal)
      ) {
        return [ps.type.literal]
      }
    }
  }
  return []
}

const scopedFactHandlersOf = (
  subscriptions: Subscriptions<any, any, any> | undefined,
): ReadonlyMap<string, RuntimeScopedEntry> => {
  const handlers = new Map<string, RuntimeScopedEntry>()
  if (subscriptions === undefined) {
    return handlers
  }
  for (const [entryName, entry] of Record.toEntries(subscriptions)) {
    if (!isRuntimeScopedEntry(entry)) {
      continue
    }
    for (const factSchema of entry.facts) {
      for (const tag of factTagsOfAst(factSchema.ast)) {
        if (handlers.has(tag)) {
          throw new Error(
            `[foldkit] Program.make: duplicate Subscription fact tag "${tag}" declared on "${entryName}"`,
          )
        }
        handlers.set(tag, entry)
      }
    }
  }
  return handlers
}

/**
 * Defines a renderer-free Foldkit Program while preserving inferred types.
 * A Program that declares a `catalog` and no `interaction` gets one derived
 * from the catalog, so every Client can press its Actions. The exact
 * Catalog type survives, so `useActions(program).increment` type-checks.
 *
 * When `Model` is built with `Program.model(...)`:
 * - `subscriptions` must be built with `Subscription.forModel(Model)`.
 * - Subscription facts are excluded from `config.update` and dispatched through
 *   each entry's `apply` + `applySubscriptionPatch`.
 * - `synchronization.keepOnRefold` is auto-derived via `mergeOnRefold` unless
 *   explicitly overridden, and every Subscription fact tag is marked `isLocalOnly`.
 */
export function make<
  ModelSchema extends AnyDurabilityModel,
  Message extends Readonly<{ _tag: string }>,
  C extends AnyCatalog,
  SubscriptionFacts extends Readonly<{ _tag: string }> = never,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: DurabilityProgramConfig<
    ModelSchema,
    Message,
    SubscriptionFacts,
    Resources,
    ManagedResourceServices,
    P
  > &
    Readonly<{ catalog: C }>,
): Program<
  ModelSchema['Type'],
  Message,
  Resources,
  ManagedResourceServices,
  P
> &
  Readonly<{ Model: ModelSchema; catalog: C }>
export function make<
  ModelSchema extends AnyDurabilityModel,
  Message extends Readonly<{ _tag: string }>,
  SubscriptionFacts extends Readonly<{ _tag: string }> = never,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: DurabilityProgramConfig<
    ModelSchema,
    Message,
    SubscriptionFacts,
    Resources,
    ManagedResourceServices,
    P
  >,
): Program<
  ModelSchema['Type'],
  Message,
  Resources,
  ManagedResourceServices,
  P
> &
  Readonly<{ Model: ModelSchema }>
export function make<
  Model,
  Message extends Readonly<{ _tag: string }>,
  C extends AnyCatalog,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P> &
    Readonly<{ Model: NonDurabilitySchema<Model>; catalog: C }>,
): Program<Model, Message, Resources, ManagedResourceServices, P> &
  Readonly<{ catalog: C }>
export function make<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P> &
    Readonly<{ Model: NonDurabilitySchema<Model> }>,
): Program<Model, Message, Resources, ManagedResourceServices, P>
export function make(program: any): any {
  const factHandlers = scopedFactHandlersOf(program.subscriptions)
  const isClassified = isDurabilityModelAst(program.Model.ast)

  const originalUpdate = program.update
  const update =
    factHandlers.size === 0
      ? originalUpdate
      : (
          model: any,
          message: any,
        ): readonly [any, ReadonlyArray<ProgramCommand<any, any>>] => {
          const handler = factHandlers.get(message._tag)
          if (handler !== undefined) {
            const applied = handler.apply(model, message)
            if (globalThis.Array.isArray(applied)) {
              const [patch, commands] = applied
              return [
                applySubscriptionPatch(program.Model.ast, model, patch),
                commands,
              ]
            }
            return [
              applySubscriptionPatch(program.Model.ast, model, applied),
              [],
            ]
          }
          return originalUpdate(model, message)
        }

  const existingSync = program.synchronization
  const synchronization =
    existingSync === undefined
      ? undefined
      : {
          ...existingSync,
          ...(existingSync.keepOnRefold === undefined && isClassified
            ? {
                keepOnRefold: (current: any, refolded: any): any =>
                  mergeOnRefold(program.Model.ast, current, refolded),
              }
            : {}),
          ...(factHandlers.size > 0
            ? {
                isLocalOnly: (message: any): boolean =>
                  factHandlers.has(message._tag) ||
                  (existingSync.isLocalOnly?.(message) ?? false),
              }
            : {}),
        }

  const interaction =
    program.interaction === undefined && program.catalog !== undefined
      ? fromCatalog(program.catalog)
      : program.interaction

  return {
    ...program,
    update,
    ...(synchronization === undefined ? {} : { synchronization }),
    ...(interaction === undefined ? {} : { interaction }),
  }
}

/** Extracts the Model type from a Program. */
export type ModelOf<Definition> =
  Definition extends Program<
    infer Model,
    infer _Message,
    infer _Resources,
    infer _ManagedResourceServices,
    infer _Ports
  >
    ? Model
    : never

/** Extracts the Message type from a Program. */
export type MessageOf<Definition> =
  Definition extends Program<
    infer _Model,
    infer Message,
    infer _Resources,
    infer _ManagedResourceServices,
    infer _Ports
  >
    ? Message
    : never

/** Extracts the Effect service requirements from a Program. */
export type ResourcesOf<Definition> =
  Definition extends Program<
    infer _Model,
    infer _Message,
    infer Resources,
    infer _ManagedResourceServices,
    infer _Ports
  >
    ? Resources
    : never

/** Extracts the ManagedResource service requirements from a Program. */
export type ManagedResourceServicesOf<Definition> =
  Definition extends Program<
    infer _Model,
    infer _Message,
    infer _Resources,
    infer ManagedResourceServices,
    infer _Ports
  >
    ? ManagedResourceServices
    : never

/** Extracts the Ports declaration from a Program. */
export type PortsOf<Definition> =
  Definition extends Program<
    infer _Model,
    infer _Message,
    infer _Resources,
    infer _ManagedResourceServices,
    infer P
  >
    ? P
    : never
