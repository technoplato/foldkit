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
import type { AnyProgram } from '../program/compose.js'
import type { Program, ProgramSynchronization } from '../program/program.js'
import {
  type SyncedMessage,
  type SyncedModel,
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
> = Program<Model, Message, any, any, any> &
  Readonly<{
    of: AnyProgram &
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
 */
export type StartConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
> = Readonly<{
  program: SyncStartProgram<Model, Message>
  sync: SyncEngine
  resources?: Layer.Layer<Resources>
  policy?: SessionPolicy
  clock?: () => number
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
>(
  config: StartConfig<Model, Message, Resources> &
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
>(
  config: StartConfig<Model, Message, Resources>,
): Effect.Effect<
  StartedProgram<Model, Message>,
  ProgramRuntimeStartError | MissingProgramSynchronization,
  Scope.Scope
>
export function start<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
>(
  config: StartConfig<Model, Message, Resources>,
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

    const policyOf = (childModel: unknown): SessionPolicy =>
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
    let lastWrite: Option.Option<SyncWriteResult> = Option.none()
    let lastApplied: Option.Option<LogRowOrder> = Option.none()
    let clockMs = 0
    const outbox: Array<SyncWrite> = []
    const outboxFlushMs = 250
    const [initialChildModel] = program.of.init()

    const runtime = yield* makeProgramRuntime({
      program,
      resources: (config.resources ?? Layer.empty) as Layer.Layer<Resources>,
    })
    yield* runtime.initialization

    const currentPolicy = (): SessionPolicy => {
      const model = runtime.readModel() as SyncedModel<unknown, Message>
      if (model._tag !== 'Ready') {
        return policyOf(initialChildModel)
      }
      const { _tag: _readyTag, ...childModel } = model
      return policyOf(childModel)
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

    /**
     * Folds every known row from the initial Model, in log order. Each
     * row's audience follows the session policy in force just before it,
     * so every Processor that holds the same rows reaches the same Model.
     * Commands from the child update are discarded: these Messages already
     * happened once.
     */
    const foldLog = (): Readonly<{
      model: unknown
      maxOrder: Option.Option<LogRowOrder>
    }> => {
      const entries = pipe(
        Array.fromIterable(knownRows.values()),
        Array.filterMap(row =>
          Option.match(rowOrderOf(row), {
            onNone: () => Result.failVoid,
            onSome: order => Result.succeed({ order, row }),
          }),
        ),
        Array.sort(logEntryOrder),
      )
      const model = Array.reduce(
        entries,
        initialChildModel,
        (folded, entry) => {
          const decoded = decodeUnknown(program.message, entry.row)
          if (
            Option.isNone(decoded) ||
            !appliesHere(policyOf(folded), decoded.value, entry.row)
          ) {
            return folded
          }
          const [next] = program.of.update(folded, decoded.value)
          return next
        },
      )
      return {
        model,
        maxOrder: Option.map(Array.last(entries), entry => entry.order),
      }
    }

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
      const folded = foldLog()
      lastApplied = folded.maxOrder
      runtime.send(
        asMessage<Message>({
          _tag: 'SnapshotReceived',
          model: folded.model,
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

    yield* engine.subscribe(onEvent)
    yield* flushOutbox().pipe(
      Effect.repeat(Schedule.spaced(Duration.millis(outboxFlushMs))),
      Effect.forkScoped,
    )

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
