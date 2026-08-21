import {
  Array,
  Effect,
  Layer,
  Option,
  Order,
  Result,
  Schema as S,
  Scope,
  pipe,
} from 'effect'

import type { Ports } from '../port/port.js'
import type { AnyProgram } from '../program/compose.js'
import type { Program } from '../program/program.js'
import {
  type SyncedMessage,
  type SyncedModel,
  isChildMessage,
} from '../program/sync.js'
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
  isEmptySnapshot,
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
    of: AnyProgram
    snapshot: S.Top
    message: S.Top
  }>

/** Runtime.start options. Engine is a Host argument. The Program stays pure. */
export type StartConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
> = Readonly<{
  program: SyncStartProgram<Model, Message>
  sync: SyncEngine
  resources?: Layer.Layer<Resources>
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
 * The boundary after a snapshot row. `at` is the write time of the
 * last Message the snapshot folded, so rows in the same millisecond
 * are treated as covered.
 */
const snapshotBoundary = (at: number): LogRowOrder => ({
  createdAtMs: at,
  id: '\u{10FFFF}',
})

const logEntryOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (entry: Readonly<{ order: LogRowOrder; row: unknown }>) =>
      entry.order.createdAtMs,
  ),
  Order.mapInput(
    Order.String,
    (entry: Readonly<{ order: LogRowOrder; row: unknown }>) => entry.order.id,
  ),
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
 */
export const start = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
>(
  config: StartConfig<Model, Message, Resources>,
): Effect.Effect<
  StartedProgram<Model, Message>,
  ProgramRuntimeStartError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const program = config.program
    const engine = config.sync
    const knownRows = new Map<string, unknown>()
    let lastWrite: Option.Option<SyncWriteResult> = Option.none()
    let lastApplied: Option.Option<LogRowOrder> = Option.none()
    const [initialChildModel] = program.of.init()
    let bootBase: Readonly<{
      model: unknown
      order: Option.Option<LogRowOrder>
    }> = {
      model: initialChildModel,
      order: Option.none(),
    }

    const runtime = yield* makeProgramRuntime({
      program,
      resources: (config.resources ?? Layer.empty) as Layer.Layer<Resources>,
    })
    yield* runtime.initialization

    const rememberRow = (row: unknown): void => {
      const id = readRowString(row, 'id')
      if (Option.isSome(id) && id.value !== '') {
        knownRows.set(id.value, row)
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
     * Folds the boot base plus every known row after it, ordered by
     * `createdAtMs` then `id`. Commands from the child update are
     * discarded: these Messages already happened once.
     */
    const foldLog = (): Readonly<{
      model: unknown
      maxOrder: Option.Option<LogRowOrder>
    }> => {
      const entries = pipe(
        Array.fromIterable(knownRows.values()),
        Array.filterMap(row => {
          const order = rowOrderOf(row)
          if (Option.isNone(order)) {
            return Result.failVoid
          }
          if (
            Option.isSome(bootBase.order) &&
            !isRowOrderAfter(order.value, bootBase.order.value)
          ) {
            return Result.failVoid
          }
          return Result.succeed({ order: order.value, row })
        }),
        Array.sort(logEntryOrder),
      )
      const model = Array.reduce(entries, bootBase.model, (folded, entry) => {
        const decoded = decodeUnknown(program.message, entry.row)
        if (Option.isNone(decoded)) {
          return folded
        }
        const [next] = program.of.update(folded, decoded.value)
        return next
      })
      const maxOrder = pipe(
        Array.last(entries),
        Option.map(entry => entry.order),
        Option.orElse(() => bootBase.order),
      )
      return { model, maxOrder }
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
          nowMs(),
        )
        rememberRow(write.message)
        const writtenOrder = rowOrderOf(write.message)
        if (Option.isSome(writtenOrder)) {
          bumpLastApplied(writtenOrder.value)
        }
        const written = yield* engine.write(write).pipe(Effect.result)
        if (Result.isFailure(written)) {
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
      const bootSnapshot = applyBoot.success.snapshot
      if (isEmptySnapshot(bootSnapshot)) {
        const folded = foldLog()
        lastApplied = folded.maxOrder
        runtime.send(
          asMessage<Message>({
            _tag: 'SnapshotReceived',
            model: folded.model,
          }),
        )
      } else {
        const decoded = decodeUnknown(program.snapshot, bootSnapshot)
        if (Option.isSome(decoded)) {
          const snapshotAt = readRowNumber(bootSnapshot, 'at')
          bootBase = {
            model: decoded.value,
            order: Option.map(snapshotAt, snapshotBoundary),
          }
          const folded = foldLog()
          lastApplied = folded.maxOrder
          runtime.send(
            asMessage<Message>({
              _tag: 'SnapshotReceived',
              model: folded.model,
            }),
          )
        } else {
          runtime.send(
            asMessage<Message>(
              decodeFailed({
                what: 'Instant sent a snapshot this Program cannot read.',
                meaning: 'The count row did not match the snapshot Schema.',
                fix: 'Do not guess the count. Fix the snapshot Schema.',
                cause: 'Snapshot Schema decode failed.',
                raw: bootSnapshot,
              }),
            ),
          )
        }
      }
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
      runtime.send(
        asMessage<Message>({
          _tag: 'RemoteMessageReceived',
          message: decoded.value,
        }),
      )
      if (Option.isSome(order)) {
        bumpLastApplied(order.value)
      }
    }

    yield* engine.subscribe(onEvent)

    return {
      ...runtime,
      send: (message: Message, options) => {
        runtime.send(message, options)
        Effect.runFork(persist(message))
      },
      run: (message: Message, options) =>
        runtime.run(message, options).pipe(Effect.tap(() => persist(message))),
      lastWrite: () => lastWrite,
    }
  })

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
