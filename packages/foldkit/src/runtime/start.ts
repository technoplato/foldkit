import {
  Array,
  Duration,
  Effect,
  Layer,
  Option,
  Order,
  Result,
  Schema as S,
  Schedule,
  Scope,
  pipe,
} from 'effect'

import type { Ports } from '../port/port.js'
import type { Program, ProgramSynchronization } from '../program/program.js'
import {
  type SyncedMessage,
  type SyncedModel,
  childOfReady,
  isChildMessage,
} from '../program/sync.js'
import {
  type MessageCategory,
  type MissingProgramSynchronization,
  type SessionPolicy,
  includesProcessor,
  legacyMirrorSessionPolicy,
  resolveAudience,
  validateProgramSynchronization,
} from '../synchronization/synchronization.js'
import * as LocalSnapshot from './localSnapshot.js'
import type { LocalSnapshotStore } from './localSnapshot.js'
import type { ProgramRuntime } from './programRuntime.js'
import {
  type ProgramRuntimeStartError,
  makeProgramRuntime,
} from './programRuntime.js'
import {
  type LogRowOrder,
  type SyncEngine,
  type SyncLink,
  type SyncTransportError,
  type SyncWrite,
  type SyncWriteResult,
  isRowOrderAfter,
  readRowNumber,
  readRowString,
  rowOrderOf,
} from './syncEngine.js'

/** A Program produced by {@link Program.compose.sync}. */
export type SyncStartProgram<
  Model,
  Message extends Readonly<{ _tag: string }>,
  ChildModel = any,
> = Program<Model, Message, any, any, any> &
  Readonly<{
    of: Program<ChildModel, any, any, any, any> &
      Readonly<{ synchronization?: ProgramSynchronization<any, any> }>
    snapshot: S.Top
    message: S.Top
  }>

/**
 * Runtime.start options. Engine is a Host argument. The Program stays pure.
 *
 * `policy` decides who applies each synced Message (ADR 0004) for a Program
 * that does not keep its session as state. A Program composed with
 * `Session.compose` ignores it: its folded session state decides, so every
 * Processor reads the same mode at the same log position. Mirror, the
 * default, applies everything everywhere; SharedDomain applies Navigation
 * Messages only on the Processor that sent them.
 *
 * `clock` reads wall time in milliseconds. Tests pass a skewed clock.
 *
 * `localSnapshot` keeps this device's fold of the log, so a reload paints
 * at once and folds only the rows written since. Every Processor on a
 * device may share one store, such as two tabs sharing `localStorage`.
 */
export type StartConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ChildModel = any,
> = Readonly<{
  program: SyncStartProgram<Model, Message, ChildModel>
  sync: SyncEngine
  resources?: Layer.Layer<Resources>
  policy?: SessionPolicy
  clock?: () => number
  localSnapshot?: LocalSnapshotStore
}>

/** A live synced runtime. `lastWrite` is the last Instant write result. */
export type StartedProgram<
  Model,
  Message,
  P extends Ports | undefined = undefined,
> = ProgramRuntime<Model, Message, P> &
  Readonly<{
    lastWrite: () => Option.Option<SyncWriteResult>
  }>

const nowMs = (): number => Date.now()

const maximumClockLeadMs = Duration.toMillis(Duration.hours(24))

const newMessageId = (): string => globalThis.crypto.randomUUID()

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return { ...value }
  }
  return {}
}

const fillWriteTime = (
  snapshot: unknown,
  message: unknown,
  processor: string,
  now: number,
): SyncWrite => {
  const snapshotRow = asRecord(snapshot)
  const messageRow = asRecord(message)
  const existingId = readRowString(messageRow, 'id')
  const messageId =
    Option.isNone(existingId) || existingId.value === ''
      ? newMessageId()
      : existingId.value
  return {
    snapshot: {
      ...snapshotRow,
      asOf: processor,
      at: now,
    },
    message: {
      ...messageRow,
      id: messageId,
      from: processor,
      createdAtMs: now,
    },
  }
}

const decodeUnknown = <A>(schema: S.Top, value: unknown): Option.Option<A> =>
  S.decodeUnknownOption(schema as never)(value) as Option.Option<A>

const encodeUnknown = (
  schema: S.Top,
  value: unknown,
): Result.Result<unknown, unknown> =>
  Result.try({
    try: () => S.encodeUnknownSync(schema as never)(value),
    catch: error => error,
  })

const transportFailed = <Msg>(fields: {
  readonly what: string
  readonly meaning: string
  readonly fix: string
  readonly sent?: Msg
  readonly cause: string
  readonly raw?: unknown
}) => ({
  _tag: 'SyncFailed' as const,
  error: {
    _tag: 'TransportFailed' as const,
    what: fields.what,
    meaning: fields.meaning,
    fix: fields.fix,
    cause: fields.cause,
    ...(fields.sent === undefined ? {} : { sent: fields.sent }),
    ...(fields.raw === undefined ? {} : { raw: fields.raw }),
  },
})

const asMessage = <Message>(message: unknown): Message => message as Message

/**
 * Folds in explicit causality order: same-actor rows keep their write
 * sequence even inside one millisecond; cross-actor ties stay
 * deterministic by actor then id.
 */
const logEntryOrder = Order.make(
  (
    a: Readonly<{ order: LogRowOrder; row: unknown }>,
    b: Readonly<{ order: LogRowOrder; row: unknown }>,
  ) =>
    isRowOrderAfter(a.order, b.order)
      ? 1
      : isRowOrderAfter(b.order, a.order)
        ? -1
        : 0,
)

type LogEntry = Readonly<{ order: LogRowOrder; row: unknown }>

/**
 * A fold to start from: the Model after every row at or before
 * `position`, and the ids of those rows.
 */
type FoldBase<ChildModel> = Readonly<{
  model: ChildModel
  position: LogRowOrder
  ids: ReadonlySet<string>
}>

/** The Processor id no row names, so a fold from it sees only shared rows. */
const strangerViewpoint = ''

const idOfRow = (row: unknown): string =>
  Option.getOrElse(readRowString(row, 'id'), () => '')

const decodeFailed = <Msg>(fields: {
  readonly what: string
  readonly meaning: string
  readonly fix: string
  readonly sent?: Msg
  readonly cause?: string
  readonly raw?: unknown
}) => ({
  _tag: 'SyncFailed' as const,
  error: {
    _tag: 'DecodeFailed' as const,
    what: fields.what,
    meaning: fields.meaning,
    fix: fields.fix,
    ...(fields.sent === undefined ? {} : { sent: fields.sent }),
    ...(fields.cause === undefined ? {} : { cause: fields.cause }),
    ...(fields.raw === undefined ? {} : { raw: fields.raw }),
  },
})

/**
 * Starts a synced Program. Instant I/O lives here, not in update.
 *
 * Boot reads one snapshot and sends SnapshotReceived or SyncFailed.
 * Live rows from other Processors become RemoteMessageReceived.
 * This Processor's own `from` is not sent again.
 *
 * Hosts must hold a Scope. Do not wrap a long-lived Client in
 * `Effect.scoped(Runtime.start())`.
 *
 * Without `policy` the Program runs in Mirror, which needs no Message
 * classifier, so start cannot fail with MissingProgramSynchronization.
 * Passing SharedDomain or Follow for a Program without `synchronization`
 * fails with it instead of guessing which Messages are Navigation.
 */
export function start<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ChildModel = any,
>(
  config: StartConfig<Model, Message, Resources, ChildModel> &
    Readonly<{ policy?: undefined }>,
): Effect.Effect<
  StartedProgram<Model, Message>,
  ProgramRuntimeStartError,
  Scope.Scope
>
export function start<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ChildModel = any,
>(
  config: StartConfig<Model, Message, Resources, ChildModel>,
): Effect.Effect<
  StartedProgram<Model, Message>,
  ProgramRuntimeStartError | MissingProgramSynchronization,
  Scope.Scope
>
export function start<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ChildModel = any,
>(
  config: StartConfig<Model, Message, Resources, ChildModel>,
): Effect.Effect<
  StartedProgram<Model, Message>,
  ProgramRuntimeStartError | MissingProgramSynchronization,
  Scope.Scope
> {
  return Effect.gen(function* () {
    const program = config.program
    const engine = config.sync
    const configuredPolicy = config.policy ?? legacyMirrorSessionPolicy()
    yield* validateProgramSynchronization(configuredPolicy, program.of)
    const childSynchronization = program.of.synchronization
    const childSessionPolicyOf = childSynchronization?.sessionPolicyOf
    const clock = config.clock ?? nowMs

    const policyOf = (childModel: Omit<ChildModel, '_tag'>): SessionPolicy =>
      childSessionPolicyOf === undefined
        ? configuredPolicy
        : childSessionPolicyOf(childModel)

    const categoryOf = (message: unknown): MessageCategory =>
      childSynchronization === undefined
        ? 'Domain'
        : childSynchronization.messageCategory(message)

    const appliesTo = (
      policy: SessionPolicy,
      message: unknown,
      originatingProcessor: string,
      processor: string,
    ): boolean => {
      const decision = resolveAudience(
        policy,
        categoryOf(message),
        originatingProcessor,
      )
      return (
        decision._tag !== 'ReadOnlyFollowerRejected' &&
        includesProcessor(decision, processor)
      )
    }

    const appliesHere = (
      policy: SessionPolicy,
      message: unknown,
      row: unknown,
    ): boolean =>
      appliesTo(
        policy,
        message,
        Option.getOrElse(readRowString(row, 'from'), () => ''),
        engine.processor,
      )

    const knownRows = new Map<string, unknown>()
    let maybeBase: Option.Option<FoldBase<ChildModel>> = Option.none()
    let isLocalSnapshotStale = false
    let isLogRead = false
    let lastWrite: Option.Option<SyncWriteResult> = Option.none()
    let lastApplied: Option.Option<LogRowOrder> = Option.none()
    let clockMs = 0
    const outbox: Array<SyncWrite> = []
    const outboxFlushMs = 250
    const localSnapshotSaveMs = 1000
    const [initialChildModel] = program.of.init()
    const snapshotProgram: LocalSnapshot.SnapshotProgram<ChildModel> = {
      id: program.of.id,
      version: program.of.version,
      Model: program.of.Model,
    }

    const runtime = yield* makeProgramRuntime({
      program,
      resources: (config.resources ?? Layer.empty) as Layer.Layer<Resources>,
    })
    yield* runtime.initialization

    const currentPolicy = (): SessionPolicy => {
      const model = runtime.readModel() as SyncedModel<ChildModel, Message>
      if (model._tag !== 'Ready') {
        return policyOf(initialChildModel)
      }
      return policyOf(childOfReady(model))
    }

    const isRejectedLocally = (message: Message): boolean =>
      isChildMessage(message) &&
      !appliesTo(currentPolicy(), message, engine.processor, engine.processor)

    const learnTime = (row: unknown): void => {
      const createdAtMs = readRowNumber(row, 'createdAtMs')
      if (
        Option.isSome(createdAtMs) &&
        createdAtMs.value <= clock() + maximumClockLeadMs
      ) {
        clockMs = Math.max(clockMs, createdAtMs.value)
      }
    }

    const stampTime = (): number => {
      const stamped = Math.max(clock(), clockMs + 1)
      clockMs = stamped
      return stamped
    }

    const rememberRow = (row: unknown): void => {
      const id = readRowString(row, 'id')
      if (Option.isSome(id) && id.value !== '') {
        knownRows.set(id.value, row)
        learnTime(row)
        isLocalSnapshotStale = true
      }
    }

    const isKnownRow = (row: unknown): boolean => {
      const id = readRowString(row, 'id')
      return Option.isSome(id) && id.value !== '' && knownRows.has(id.value)
    }

    const bumpLastApplied = (order: LogRowOrder): void => {
      if (
        Option.isNone(lastApplied) ||
        isRowOrderAfter(order, lastApplied.value)
      ) {
        lastApplied = Option.some(order)
      }
    }

    const orderedRows = (): ReadonlyArray<LogEntry> =>
      pipe(
        Array.fromIterable(knownRows.values()),
        Array.filterMap(row =>
          Option.match(rowOrderOf(row), {
            onNone: () => Result.failVoid,
            onSome: order => Result.succeed({ order, row }),
          }),
        ),
        Array.sort(logEntryOrder),
      )

    /**
     * Folds rows onto a Model, in log order, as `viewpoint` sees them. Each
     * row's audience follows the session policy in force just before it,
     * so every Processor that holds the same rows reaches the same Model.
     * Commands from the child update are discarded: these Messages already
     * happened once.
     */
    const foldRows = (
      start: ChildModel,
      entries: ReadonlyArray<LogEntry>,
      viewpoint: string,
    ): ChildModel =>
      Array.reduce(entries, start, (folded, entry) => {
        const decoded = decodeUnknown(program.message, entry.row)
        if (
          Option.isNone(decoded) ||
          !appliesTo(
            policyOf(folded),
            decoded.value,
            Option.getOrElse(readRowString(entry.row, 'from'), () => ''),
            viewpoint,
          )
        ) {
          return folded
        }
        const [next] = program.of.update(folded, decoded.value)
        return next
      })

    // NOTE: a base is folded as a Processor that wrote none of its rows,
    // so a base that covers this Processor's own rows cannot stand in for
    // this Processor's fold. Those rows may be local navigation only it
    // applies.
    const isBaseUsable = (
      base: FoldBase<ChildModel>,
      entries: ReadonlyArray<LogEntry>,
      viewpoint: string,
    ): boolean =>
      Array.every(
        entries,
        entry =>
          isRowOrderAfter(entry.order, base.position) ||
          (base.ids.has(idOfRow(entry.row)) &&
            (viewpoint === strangerViewpoint ||
              Option.getOrElse(readRowString(entry.row, 'from'), () => '') !==
                viewpoint)),
      )

    /**
     * Folds every known row as `viewpoint` sees them, starting from the
     * base when it still covers exactly the rows before its position, and
     * from the initial Model otherwise.
     */
    const foldFromBase = (
      entries: ReadonlyArray<LogEntry>,
      viewpoint: string,
    ): ChildModel =>
      Option.match(
        Option.filter(maybeBase, base =>
          isBaseUsable(base, entries, viewpoint),
        ),
        {
          onNone: () => foldRows(initialChildModel, entries, viewpoint),
          onSome: base =>
            foldRows(
              base.model,
              Array.filter(entries, entry =>
                isRowOrderAfter(entry.order, base.position),
              ),
              viewpoint,
            ),
        },
      )

    const foldLog = (): Readonly<{
      model: ChildModel
      maxOrder: Option.Option<LogRowOrder>
    }> => {
      const entries = orderedRows()
      return {
        model: foldFromBase(entries, engine.processor),
        maxOrder: Option.map(Array.last(entries), entry => entry.order),
      }
    }

    /**
     * Saves the fold every Processor shares, as of the newest known row,
     * and keeps it as the base later folds start from.
     */
    const saveLocalSnapshot = (
      store: LocalSnapshotStore,
    ): Effect.Effect<void> =>
      Effect.suspend(() => {
        isLocalSnapshotStale = false
        const entries = orderedRows()
        return Option.match(
          Option.all({
            newest: Array.last(entries),
            watermark: LocalSnapshot.watermarkOf(
              Array.map(entries, entry => entry.row),
            ),
          }),
          {
            onNone: () => Effect.void,
            onSome: ({ newest, watermark }) => {
              const model = foldFromBase(entries, strangerViewpoint)
              maybeBase = Option.some({
                model,
                position: newest.order,
                ids: new Set(Array.map(entries, entry => idOfRow(entry.row))),
              })
              return Option.match(
                LocalSnapshot.encode(snapshotProgram, { model, watermark }),
                { onNone: () => Effect.void, onSome: store.save },
              )
            },
          },
        )
      })

    const persist = (message: Message): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (!isChildMessage(message)) {
          return
        }
        const model = runtime.readModel() as SyncedModel<unknown, Message>
        if (model._tag !== 'Ready') {
          return
        }
        const { _tag: _readyTag, ...childModel } = model
        const encodedSnapshot = encodeUnknown(program.snapshot, childModel)
        if (Result.isFailure(encodedSnapshot)) {
          runtime.send(
            asMessage<Message>(
              decodeFailed({
                what: 'This Processor could not encode the snapshot.',
                meaning: 'The Ready Model did not match the snapshot Schema.',
                fix: 'Keep the local number. Fix the snapshot Schema.',
                sent: message,
                cause: 'Snapshot Schema encode failed.',
                raw: childModel,
              }),
            ),
          )
          return
        }
        const encodedMessage = encodeUnknown(program.message, message)
        if (Result.isFailure(encodedMessage)) {
          runtime.send(
            asMessage<Message>(
              decodeFailed({
                what: 'This Processor could not encode the Message.',
                meaning: 'The sent Message did not match the Message Schema.',
                fix: 'Keep the local number. Fix the Message Schema.',
                sent: message,
                cause: 'Message Schema encode failed.',
                raw: message,
              }),
            ),
          )
          return
        }
        const write = fillWriteTime(
          encodedSnapshot.success,
          encodedMessage.success,
          engine.processor,
          stampTime(),
        )
        rememberRow(write.message)
        const writtenOrder = rowOrderOf(write.message)
        const isBeforeApplied =
          Option.isSome(writtenOrder) &&
          Option.isSome(lastApplied) &&
          !isRowOrderAfter(writtenOrder.value, lastApplied.value)
        if (isBeforeApplied) {
          const folded = foldLog()
          lastApplied = folded.maxOrder
          runtime.send(
            asMessage<Message>({
              _tag: 'LogRefolded',
              model: folded.model,
            }),
          )
        } else if (Option.isSome(writtenOrder)) {
          bumpLastApplied(writtenOrder.value)
        }
        if (Array.isArrayNonEmpty(outbox)) {
          outbox.push(write)
          lastWrite = Option.some({ link: 'queued' })
          return
        }
        const written = yield* engine.write(write).pipe(Effect.result)
        if (Result.isFailure(written)) {
          outbox.push(write)
          lastWrite = Option.some({ link: 'queued' })
          runtime.send(
            asMessage<Message>(
              transportFailed({
                what: 'Instant did not accept this Message.',
                meaning:
                  'The local Model is Ready. Instant rejected the write or the network is down.',
                fix: 'Keep the local number. Retry the same Message id when Instant is back.',
                sent: message,
                cause: written.failure.cause,
                raw: write,
              }),
            ),
          )
          return
        }
        lastWrite = Option.some(written.success)
      })

    const flushOutbox = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (Array.isArrayEmpty(outbox)) {
          return
        }
        const pending = outbox.splice(0, outbox.length)
        for (const write of pending) {
          const written = yield* engine.write(write).pipe(Effect.result)
          if (Result.isFailure(written)) {
            outbox.unshift(write)
            lastWrite = Option.some({ link: 'queued' })
            return
          }
          lastWrite = Option.some(written.success)
        }
      })

    const maybeLocalSnapshot =
      config.localSnapshot === undefined
        ? Option.none<LocalSnapshot.LocalSnapshot<ChildModel>>()
        : Option.flatMap(yield* config.localSnapshot.load, text =>
            LocalSnapshot.decode(snapshotProgram, text),
          )
    if (Option.isSome(maybeLocalSnapshot)) {
      lastApplied = Option.some(maybeLocalSnapshot.value.watermark.position)
      runtime.send(
        asMessage<Message>({
          _tag: 'SnapshotReceived',
          model: maybeLocalSnapshot.value.model,
        }),
      )
    }

    const onEvent = (event: {
      readonly _tag: string
      readonly row: unknown
    }) => {
      if (event._tag === 'Snapshot') {
        return
      }
      const from = readRowString(event.row, 'from')
      if (Option.isSome(from) && from.value === engine.processor) {
        rememberRow(event.row)
        return
      }
      if (isKnownRow(event.row)) {
        return
      }
      rememberRow(event.row)
      const decoded = decodeUnknown(program.message, event.row)
      if (Option.isNone(decoded)) {
        runtime.send(
          asMessage<Message>(
            decodeFailed({
              what: 'Instant sent a Message this Program cannot read.',
              meaning: 'The row did not match the Message Schema.',
              fix: 'Keep the current count. Check the Message Schema.',
              cause: 'Message Schema decode failed.',
              raw: event.row,
            }),
          ),
        )
        return
      }
      const order = rowOrderOf(event.row)
      const isOutOfOrder =
        Option.isSome(order) &&
        Option.isSome(lastApplied) &&
        !isRowOrderAfter(order.value, lastApplied.value)
      if (isOutOfOrder) {
        const folded = foldLog()
        lastApplied = folded.maxOrder
        runtime.send(
          asMessage<Message>({
            _tag: 'LogRefolded',
            model: folded.model,
          }),
        )
        return
      }
      if (Option.isSome(order)) {
        bumpLastApplied(order.value)
      }
      if (!appliesHere(currentPolicy(), decoded.value, event.row)) {
        return
      }
      runtime.send(
        asMessage<Message>({
          _tag: 'RemoteMessageReceived',
          message: decoded.value,
        }),
      )
    }

    const saveWhenStale = Effect.suspend(() =>
      config.localSnapshot !== undefined && isLogRead && isLocalSnapshotStale
        ? saveLocalSnapshot(config.localSnapshot)
        : Effect.void,
    )

    /**
     * Reads the log, folds what the local snapshot does not cover, then
     * follows new rows. With a local snapshot already on screen, this runs
     * behind it, so a reload paints at once instead of waiting on the
     * network.
     */
    const reconcile = Effect.gen(function* () {
      const applyBoot = yield* engine.read().pipe(Effect.result)
      if (Result.isFailure(applyBoot)) {
        runtime.send(
          asMessage<Message>(
            transportFailed({
              what: 'Instant did not return a snapshot.',
              meaning: 'This Processor could not start from Instant.',
              fix: 'Check the Instant app and try again.',
              cause: applyBoot.failure.cause,
              raw: applyBoot.failure.raw,
            }),
          ),
        )
      } else {
        for (const row of applyBoot.success.messages) {
          rememberRow(row)
        }
        isLogRead = true
        const maybeProven = Option.filter(maybeLocalSnapshot, local =>
          LocalSnapshot.isProvenBy(local.watermark, applyBoot.success.messages),
        )
        maybeBase = Option.map(maybeProven, local => ({
          model: local.model,
          position: local.watermark.position,
          ids: new Set(
            pipe(
              applyBoot.success.messages,
              Array.filter(row =>
                LocalSnapshot.isAtOrBefore(row, local.watermark.position),
              ),
              Array.map(idOfRow),
            ),
          ),
        }))
        const hasRowsPastSnapshot = Option.match(maybeProven, {
          onNone: () => true,
          onSome: local =>
            Array.some(
              applyBoot.success.messages,
              row => !LocalSnapshot.isAtOrBefore(row, local.watermark.position),
            ),
        })
        const folded = foldLog()
        lastApplied = folded.maxOrder
        if (Option.isNone(maybeLocalSnapshot)) {
          runtime.send(
            asMessage<Message>({
              _tag: 'SnapshotReceived',
              model: folded.model,
            }),
          )
        } else if (hasRowsPastSnapshot) {
          runtime.send(
            asMessage<Message>({
              _tag: 'LogRefolded',
              model: folded.model,
            }),
          )
        }
      }

      yield* engine.subscribe(onEvent)
      yield* flushOutbox().pipe(
        Effect.repeat(Schedule.spaced(Duration.millis(outboxFlushMs))),
        Effect.forkScoped,
      )
      if (config.localSnapshot !== undefined) {
        yield* saveWhenStale
        yield* saveWhenStale.pipe(
          Effect.repeat(Schedule.spaced(Duration.millis(localSnapshotSaveMs))),
          Effect.forkScoped,
        )
      }
    })

    yield* Effect.addFinalizer(() => saveWhenStale)
    if (Option.isSome(maybeLocalSnapshot)) {
      yield* Effect.forkScoped(reconcile)
    } else {
      yield* reconcile
    }

    return {
      ...runtime,
      send: (message: Message, options) => {
        if (isRejectedLocally(message)) {
          return
        }
        runtime.send(message, options)
        Effect.runFork(persist(message))
      },
      run: (message: Message, options) =>
        isRejectedLocally(message)
          ? Effect.sync(() => runtime.readModel())
          : runtime
              .run(message, options)
              .pipe(Effect.tap(() => persist(message))),
      lastWrite: () => lastWrite,
    }
  })
}

/**
 * Waits until the synced Model is Ready or Failed.
 * CLI uses this so it never prints Starting.
 */
export const untilSettled = <M, Msg>(
  runtime: ProgramRuntime<SyncedModel<M, Msg>, SyncedMessage<M, Msg>>,
): Effect.Effect<SyncedModel<M, Msg>> =>
  Effect.callback<SyncedModel<M, Msg>>(resume => {
    const current = runtime.readModel()
    if (current._tag === 'Ready' || current._tag === 'Failed') {
      resume(Effect.succeed(current))
      return
    }
    const unsubscribe = runtime.observeModel(next => {
      if (next._tag === 'Ready' || next._tag === 'Failed') {
        unsubscribe()
        resume(Effect.succeed(next))
      }
    })
    return Effect.sync(unsubscribe)
  })

export type { SyncLink, SyncTransportError }
