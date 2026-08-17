/**
 * Program.compose.sync — wrap one Program so Instant I/O can feed
 * SnapshotReceived and RemoteMessageReceived into update.
 */
import { Array, Predicate, Schema as S } from 'effect'

import { ts } from '../schema/index.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramSchema,
} from './program.js'
import { make } from './program.js'

/**
 * A child Program for {@link sync}.
 *
 * This is a real Program, not the structural AnyProgram bag. AnyProgram
 * makes ModelOf and MessageOf `never`.
 */
export type SyncChild = Program<any, any, any, any, any>

/** Boot Model. The Processor has not applied a snapshot yet. */
export type Starting = {
  readonly _tag: 'Starting'
}

/** Ready Model. Child fields sit on this object. There is no `child`. */
export type Ready<M> = {
  readonly _tag: 'Ready'
} & Omit<M, '_tag'>

/** Decode of an Instant row failed. */
export type DecodeFailed<Msg> = {
  readonly _tag: 'DecodeFailed'
  readonly what: string
  readonly meaning: string
  readonly fix: string
  readonly sent?: Msg
  readonly cause?: string
  readonly raw?: unknown
}

/** Instant rejected a read or write. `cause` is Instant's sentence. */
export type TransportFailed<Msg> = {
  readonly _tag: 'TransportFailed'
  readonly what: string
  readonly meaning: string
  readonly fix: string
  readonly sent?: Msg
  readonly cause: string
  readonly raw?: unknown
}

/** Human-readable Instant I/O error. Generic on the Program Message. */
export type SyncError<Msg> = DecodeFailed<Msg> | TransportFailed<Msg>

/** Boot failed. Ready never becomes Failed. */
export type Failed<Msg> = {
  readonly _tag: 'Failed'
  readonly error: SyncError<Msg>
}

/** Synced Model. `M` is the child Model. */
export type SyncedModel<M, Msg> = Starting | Ready<M> | Failed<Msg>

/** Instant delivered a snapshot. Runtime.start sends this at boot. */
export type SnapshotReceived<M> = {
  readonly _tag: 'SnapshotReceived'
  readonly model: M
}

/** Instant delivered a Message from another Processor. */
export type RemoteMessageReceived<Msg> = {
  readonly _tag: 'RemoteMessageReceived'
  readonly message: Msg
}

/** Instant I/O failed. Starting becomes Failed. Ready stays Ready. */
export type SyncFailed<Msg> = {
  readonly _tag: 'SyncFailed'
  readonly error: SyncError<Msg>
}

/** Synced Message. Child Messages sit in the union unwrapped. */
export type SyncedMessage<M, Msg> =
  | Msg
  | SnapshotReceived<M>
  | RemoteMessageReceived<Msg>
  | SyncFailed<Msg>

/** Options for {@link sync}. */
export type SyncOptions = Readonly<{
  /** Program id. Default `sync:${child.id}`. */
  id?: string
  /** Program version. Default is the child version. */
  version?: number
}>

/** DecodeFailed and TransportFailed constructors for one Message Schema. */
export type SyncErrorConstructors<Msg> = Readonly<{
  DecodeFailed: (fields: {
    readonly what: string
    readonly meaning: string
    readonly fix: string
    readonly sent?: Msg
    readonly cause?: string
    readonly raw?: unknown
  }) => DecodeFailed<Msg>
  TransportFailed: (fields: {
    readonly what: string
    readonly meaning: string
    readonly fix: string
    readonly sent?: Msg
    readonly cause: string
    readonly raw?: unknown
  }) => TransportFailed<Msg>
}>

/** A Program produced by {@link sync}. */
export type SyncProgram<Child extends SyncChild> = Program<
  SyncedModel<ModelOf<Child>, MessageOf<Child>>,
  SyncedMessage<ModelOf<Child>, MessageOf<Child>> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  SyncErrorConstructors<MessageOf<Child>> &
  Readonly<{
    of: Child
    snapshot: S.Top
    message: S.Top
    Starting: () => Starting
    Ready: (model: ModelOf<Child>) => Ready<ModelOf<Child>>
    Failed: (fields: {
      readonly error: SyncError<MessageOf<Child>>
    }) => Failed<MessageOf<Child>>
    SnapshotReceived: (fields: {
      readonly model: ModelOf<Child>
    }) => SnapshotReceived<ModelOf<Child>>
    RemoteMessageReceived: (fields: {
      readonly message: MessageOf<Child>
    }) => RemoteMessageReceived<MessageOf<Child>>
    SyncFailed: (fields: {
      readonly error: SyncError<MessageOf<Child>>
    }) => SyncFailed<MessageOf<Child>>
  }>

const structFields = (schema: unknown): S.Struct.Fields => {
  if (!Predicate.hasProperty(schema, 'fields')) {
    throw new Error(
      '[foldkit] Program.compose.sync of.Model must be a Struct so Ready can flatten its fields',
    )
  }
  return schema.fields as S.Struct.Fields
}

const schemaMembers = (schema: unknown): ReadonlyArray<S.Top> => {
  if (Predicate.hasProperty(schema, 'members')) {
    const members = schema.members
    if (Array.isArray(members)) {
      return members as ReadonlyArray<S.Top>
    }
  }
  return [schema as S.Top]
}

const readTag = (value: unknown): string => {
  if (Predicate.hasProperty(value, '_tag') && typeof value._tag === 'string') {
    return value._tag
  }
  return ''
}

const stripReady = <M extends { readonly _tag: string }>(
  model: M,
): Omit<M, '_tag'> => {
  const { _tag: _readyTag, ...fields } = model
  return fields
}

const toReady = <M>(model: M): Ready<M> => ({
  _tag: 'Ready',
  ...model,
})

/**
 * Builds DecodeFailed and TransportFailed for one Program Message Schema.
 *
 * `sent` is the Program Message in flight. `cause` is Instant's sentence.
 */
export const makeSyncError = <Msg>(
  Message: S.Schema<Msg>,
): S.Union<
  readonly [
    S.TaggedStruct<
      'DecodeFailed',
      {
        readonly what: typeof S.String
        readonly meaning: typeof S.String
        readonly fix: typeof S.String
        readonly sent: S.optionalKey<S.Schema<Msg>>
        readonly cause: S.optionalKey<typeof S.String>
        readonly raw: S.optionalKey<typeof S.Unknown>
      }
    >,
    S.TaggedStruct<
      'TransportFailed',
      {
        readonly what: typeof S.String
        readonly meaning: typeof S.String
        readonly fix: typeof S.String
        readonly sent: S.optionalKey<S.Schema<Msg>>
        readonly cause: typeof S.String
        readonly raw: S.optionalKey<typeof S.Unknown>
      }
    >,
  ]
> &
  SyncErrorConstructors<Msg> => {
  const DecodeFailed = ts('DecodeFailed', {
    what: S.String,
    meaning: S.String,
    fix: S.String,
    sent: S.optionalKey(Message),
    cause: S.optionalKey(S.String),
    raw: S.optionalKey(S.Unknown),
  })
  const TransportFailed = ts('TransportFailed', {
    what: S.String,
    meaning: S.String,
    fix: S.String,
    sent: S.optionalKey(Message),
    cause: S.String,
    raw: S.optionalKey(S.Unknown),
  })
  return Object.assign(S.Union([DecodeFailed, TransportFailed]), {
    DecodeFailed,
    TransportFailed,
  })
}

/**
 * Prints a SyncError for a view. Does not print `error._tag`.
 */
export const describeSyncError = <Msg>(
  error: SyncError<Msg>,
  formatMessage: (message: Msg) => string,
): string => {
  const lines: Array<string> = [
    error.what,
    `Meaning: ${error.meaning}`,
    `Fix: ${error.fix}`,
  ]
  if (error.sent !== undefined) {
    lines.push(`Sent: ${formatMessage(error.sent)}`)
  }
  if (error.cause !== undefined) {
    lines.push(`Cause: ${error.cause}`)
  }
  return Array.join(lines, '\n')
}

/**
 * Compose one Program with Instant snapshot and Message Schemas.
 *
 * Instant has no Model. Runtime.start writes and reads through the two
 * Schemas, then sends SnapshotReceived and RemoteMessageReceived.
 *
 * ```ts
 * const SyncedCounter = Program.compose.sync({
 *   of: CounterProgram,
 *   snapshot: CountProjection,
 *   message: MessageWire,
 * })
 * ```
 */
export const sync = <Child extends SyncChild>(config: {
  of: Child
  snapshot: S.Top
  message: S.Top
  id?: string
  version?: number
}): SyncProgram<Child> => {
  const child = config.of
  type ChildModel = ModelOf<Child>
  type ChildMessage = MessageOf<Child>
  type Model = SyncedModel<ChildModel, ChildMessage>
  type Message = SyncedMessage<ChildModel, ChildMessage> &
    Readonly<{ _tag: string }>

  const Starting = ts('Starting')
  const Ready = ts('Ready', structFields(child.Model))
  const SyncErrorSchema = makeSyncError(child.Message)
  const Failed = ts('Failed', {
    error: SyncErrorSchema,
  })
  const SnapshotReceived = ts('SnapshotReceived', {
    model: child.Model,
  })
  const RemoteMessageReceived = ts('RemoteMessageReceived', {
    message: child.Message,
  })
  const SyncFailed = ts('SyncFailed', {
    error: SyncErrorSchema,
  })

  const Model = S.Union([
    Starting,
    Ready,
    Failed,
  ]) as unknown as ProgramSchema<Model>
  const messageMembers = [
    ...schemaMembers(child.Message),
    SnapshotReceived,
    RemoteMessageReceived,
    SyncFailed,
  ]
  const Message = S.Union(messageMembers as never) as ProgramSchema<Message>

  const init = (): readonly [
    Model,
    ReadonlyArray<ProgramCommand<Message, any>>,
  ] => [Starting(), []]

  const update = (
    model: Model,
    message: Message,
  ): readonly [Model, ReadonlyArray<ProgramCommand<Message, any>>] => {
    if (readTag(message) === 'SnapshotReceived') {
      if (readTag(model) === 'Ready') {
        return [model, []]
      }
      const received = message as SnapshotReceived<ChildModel>
      return [toReady(received.model), []]
    }

    if (readTag(message) === 'SyncFailed') {
      if (readTag(model) !== 'Starting') {
        return [model, []]
      }
      const failed = message as SyncFailed<ChildMessage>
      return [Failed({ error: failed.error }), []]
    }

    if (readTag(model) !== 'Ready') {
      return [model, []]
    }

    const childMessage =
      readTag(message) === 'RemoteMessageReceived'
        ? (message as RemoteMessageReceived<ChildMessage>).message
        : (message as ChildMessage)

    const [nextChild, childCommands] = child.update(
      stripReady(model) as ChildModel,
      childMessage,
    )
    return [
      toReady(nextChild as ChildModel),
      childCommands as ReadonlyArray<ProgramCommand<Message, any>>,
    ]
  }

  const restore = (
    model: Model,
  ): readonly [Model, ReadonlyArray<ProgramCommand<Message, any>>] => {
    if (readTag(model) !== 'Ready' || child.restore === undefined) {
      return [model, []]
    }
    const [nextChild, childCommands] = child.restore(
      stripReady(model) as ChildModel,
    )
    return [
      toReady(nextChild as ChildModel),
      childCommands as ReadonlyArray<ProgramCommand<Message, any>>,
    ]
  }

  const valid =
    child.valid === undefined
      ? undefined
      : (
          model: Model,
          context?: Parameters<NonNullable<Child['valid']>>[1],
        ) => {
          if (readTag(model) !== 'Ready') {
            return []
          }
          return child.valid!(stripReady(model) as ChildModel, context)
        }

  const screen =
    child.screen === undefined
      ? undefined
      : (
          model: Model,
          context?: Parameters<NonNullable<Child['screen']>>[1],
        ) => {
          if (readTag(model) !== 'Ready') {
            return child.screen!(child.init()[0] as ChildModel, context)
          }
          return child.screen!(stripReady(model) as ChildModel, context)
        }

  const program = make({
    id: config.id ?? `sync:${child.id}`,
    version: config.version ?? child.version,
    Model,
    Message,
    init,
    restore,
    update,
    ...(valid === undefined ? {} : { valid }),
    ...(screen === undefined ? {} : { screen }),
  })

  return Object.assign(program, {
    of: child,
    snapshot: config.snapshot,
    message: config.message,
    Starting,
    Ready: (model: ChildModel) => toReady(model),
    Failed,
    SnapshotReceived,
    RemoteMessageReceived,
    SyncFailed,
    DecodeFailed: SyncErrorSchema.DecodeFailed,
    TransportFailed: SyncErrorSchema.TransportFailed,
  }) as SyncProgram<Child>
}

/** True when the Model is Ready. */
export const isReady = <M, Msg>(
  model: SyncedModel<M, Msg>,
): model is Ready<M> => model._tag === 'Ready'

/** True when the Model is Failed. */
export const isFailed = <M, Msg>(
  model: SyncedModel<M, Msg>,
): model is Failed<Msg> => model._tag === 'Failed'

/** True when the Model is Starting. */
export const isStarting = <M, Msg>(
  model: SyncedModel<M, Msg>,
): model is Starting => model._tag === 'Starting'

/** Reads child fields from a Ready Model. */
export const readyModel = <M extends { readonly _tag: string }>(
  model: M,
): Omit<M, '_tag'> => stripReady(model)

/** True when a Message is a child Message, not a sync wrapper. */
export const isChildMessage = (message: { readonly _tag: string }): boolean =>
  message._tag !== 'SnapshotReceived' &&
  message._tag !== 'RemoteMessageReceived' &&
  message._tag !== 'SyncFailed'
