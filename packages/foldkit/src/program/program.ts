import type { Effect, Schema } from 'effect'

import type { EffectManifest } from '../command/effectManifest.js'
import type { ManagedResources } from '../managedResource/managedResource.js'
import type { Ports } from '../port/port.js'
import type { Subscriptions } from '../subscription/subscription.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import type { VersionedEventRegistry } from './versionedEvent.js'

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

/** Program-owned classification and domain projection for synchronized sessions. */
export type ProgramSynchronization<Model, Message> = Readonly<{
  messageCategory: (message: Message) => MessageCategory
  projectDomain: (model: Model) => unknown
}>

/**
 * A renderer-free Foldkit Program.
 *
 * The Program owns the Model, Message protocol, init, update, and optional
 * Subscriptions. Rendering, platform Layers, URI carriers, and launch behavior
 * belong to clients that run the Program.
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
  synchronization?: ProgramSynchronization<Model, Message>
  versionedEvents?: VersionedEventRegistry<Message>
}>

/** Defines a renderer-free Foldkit Program while preserving inferred types. */
export const make = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
): Program<Model, Message, Resources, ManagedResourceServices, P> => program

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
