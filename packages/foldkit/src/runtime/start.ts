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
import { fromSync } from './programJournal.js'
import type {
  ProgramRuntime,
  ProgramRuntimeObserver,
} from './programRuntime.js'
import {
  type ProgramRuntimeStartError,
  makeProgramRuntime,
} from './programRuntime.js'
import {
  type LogRowOrder,
  type SyncEngine,
  type SyncLink,
  type SyncPage,
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
 *
 * `observers` connect to the runtime before it boots, such as a telemetry
 * observer that writes every transition to a file. See
 * {@link ProgramRuntimeObserver}.
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
  observers?: ReadonlyArray<ProgramRuntimeObserver<Model, Message>>
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
  programVersion: number,
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
      programVersion,
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
 * `position`, the ids of those rows this Processor knows, and the
 * watermark of every row it covers.
 */
type FoldBase<ChildModel> = Readonly<{
  model: ChildModel
  position: LogRowOrder
  ids: ReadonlySet<string>
  watermark: LocalSnapshot.Watermark
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

    const keepsOwnNavigation =
      childSynchronization?.keepsOwnNavigation ?? ((): boolean => false)

    const appliesTo = (
      policy: SessionPolicy,
      message: unknown,
      originatingProcessor: string,
      processor: string,
    ): boolean => {
      const category = categoryOf(message)
      if (
        category === 'Navigation' &&
        (keepsOwnNavigation(originatingProcessor) ||
          keepsOwnNavigation(processor))
      ) {
        return originatingProcessor === processor
      }
      const decision = resolveAudience(policy, category, originatingProcessor)
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
    let bases: ReadonlyArray<FoldBase<ChildModel>> = []
    let savedSnapshots: ReadonlyArray<LocalSnapshot.LocalSnapshot<ChildModel>> =
      []
    let maybeCursor: Option.Option<string> = Option.none()
    let isLogComplete = false
    const idsPastCursor = new Set<string>()
    let isLocalSnapshotStale = false
    let isLogRead = false
    const unconfirmedIds = new Set<string>()
    let isReadingWholeLog = false
    let lastWrite: Option.Option<SyncWriteResult> = Option.none()
    let lastApplied: Option.Option<LogRowOrder> = Option.none()
    let clockMs = 0
    const outbox: Array<SyncWrite> = []
    const outboxFlushMs = 250
    const localSnapshotSaveMs = 1000
    const cursorAdvanceMs = 5000
    const [initialChildModel] = program.of.init()
    const snapshotProgram: LocalSnapshot.SnapshotProgram<ChildModel> = {
      id: program.of.id,
      version: program.of.version,
      Model: program.of.Model,
    }

    const runtime = yield* makeProgramRuntime({
      program,
      resources: (config.resources ?? Layer.empty) as Layer.Layer<Resources>,
      ...(config.observers === undefined
        ? {}
        : { observers: config.observers }),
    })
    yield* runtime.initialization

    const sendFromSync = (message: Message): void => {
      runtime.send(message, { source: fromSync() })
    }

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

    const isLocalOnly = (message: Message): boolean =>
      isChildMessage(message) &&
      (childSynchronization?.isLocalOnly?.(message) ?? false)

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
        idsPastCursor.add(id.value)
      }
    }

    const isOwnRow = (row: unknown): boolean =>
      Option.contains(readRowString(row, 'from'), engine.processor)

    const rememberEngineRow = (row: unknown): void => {
      rememberRow(row)
      unconfirmedIds.delete(idOfRow(row))
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

    const idsAtOrBefore = (position: LogRowOrder): ReadonlySet<string> =>
      new Set(
        pipe(
          Array.fromIterable(knownRows.values()),
          Array.filter(row => LocalSnapshot.isAtOrBefore(row, position)),
          Array.map(idOfRow),
        ),
      )

    const baseOf = (
      snapshot: LocalSnapshot.LocalSnapshot<ChildModel>,
    ): FoldBase<ChildModel> => ({
      model: snapshot.model,
      position: snapshot.watermark.position,
      ids: idsAtOrBefore(snapshot.watermark.position),
      watermark: snapshot.watermark,
    })

    const entriesAfter = (
      entries: ReadonlyArray<LogEntry>,
      position: LogRowOrder,
    ): ReadonlyArray<LogEntry> =>
      Array.filter(entries, entry => isRowOrderAfter(entry.order, position))

    /**
     * Folds every known row as `viewpoint` sees them, starting from the
     * newest base that still covers exactly the rows before it, so a row
     * that landed late refolds from the snapshot just before it. Without
     * such a base it folds from the initial Model, which needs the whole
     * log: None when this Processor holds only the rows after its oldest
     * snapshot.
     */
    const foldFromBase = (
      entries: ReadonlyArray<LogEntry>,
      viewpoint: string,
    ): Option.Option<
      Readonly<{
        model: ChildModel
        watermark: Option.Option<LocalSnapshot.Watermark>
      }>
    > =>
      Option.match(
        Array.findLast(bases, base => isBaseUsable(base, entries, viewpoint)),
        {
          onSome: base => {
            const after = entriesAfter(entries, base.position)
            return Option.some({
              model: foldRows(base.model, after, viewpoint),
              watermark: Option.some(
                LocalSnapshot.extendWatermark(
                  base.watermark,
                  Array.map(after, entry => entry.row),
                ),
              ),
            })
          },
          onNone: () =>
            isLogComplete
              ? Option.some({
                  model: foldRows(initialChildModel, entries, viewpoint),
                  watermark: LocalSnapshot.watermarkOf(
                    Array.map(entries, entry => entry.row),
                  ),
                })
              : Option.none(),
        },
      )

    const newestOrder = (
      maybeFirst: Option.Option<LogRowOrder>,
      maybeSecond: Option.Option<LogRowOrder>,
    ): Option.Option<LogRowOrder> =>
      Option.match(maybeFirst, {
        onNone: () => maybeSecond,
        onSome: first =>
          Option.match(maybeSecond, {
            onNone: () => maybeFirst,
            onSome: second =>
              Option.some(isRowOrderAfter(second, first) ? second : first),
          }),
      })

    // NOTE: a fold from a kept snapshot covers the snapshot's position even
    // when no row lands after it. Taking only the newest known row would
    // drop that position on a reload with nothing new, and the live feed's
    // replay of recent rows would then look unapplied and count twice.
    const foldLog = (): Option.Option<
      Readonly<{ model: ChildModel; maxOrder: Option.Option<LogRowOrder> }>
    > => {
      const entries = orderedRows()
      return Option.map(foldFromBase(entries, engine.processor), folded => ({
        model: folded.model,
        maxOrder: newestOrder(
          Option.map(folded.watermark, watermark => watermark.position),
          Option.map(Array.last(entries), entry => entry.order),
        ),
      }))
    }

    /**
     * Saves what this device keeps between runs: the fold every Processor
     * shares as of the newest confirmed row, added to the snapshot series,
     * the rows after the oldest snapshot or past the cursor, and the
     * cursor. The rows past the cursor come back from the next read, and
     * keeping them tells those already folded from a row that landed late.
     * A write
     * that has not come back from the engine yet is left out, so a write
     * that never lands is never kept.
     */
    const saveLocalState = (store: LocalSnapshotStore): Effect.Effect<void> =>
      Effect.suspend(() => {
        isLocalSnapshotStale = false
        const entries = Array.filter(
          orderedRows(),
          entry => !unconfirmedIds.has(idOfRow(entry.row)),
        )
        const maybeNext = Option.flatMap(
          foldFromBase(entries, strangerViewpoint),
          folded =>
            Option.map(
              folded.watermark,
              (watermark): LocalSnapshot.LocalSnapshot<ChildModel> => ({
                model: folded.model,
                watermark,
              }),
            ),
        )
        return Option.match(maybeNext, {
          onNone: () => Effect.void,
          onSome: next => {
            const snapshots = LocalSnapshot.retainedSnapshots(
              savedSnapshots,
              next,
            )
            savedSnapshots = snapshots
            bases = Array.map(snapshots, baseOf)
            return Option.match(
              LocalSnapshot.encode(snapshotProgram, {
                snapshots,
                rows: Array.filter(
                  Array.map(entries, entry => entry.row),
                  row =>
                    idsPastCursor.has(idOfRow(row)) ||
                    !LocalSnapshot.isAtOrBefore(
                      row,
                      Array.headNonEmpty(snapshots).watermark.position,
                    ),
                ),
                maybeCursor,
              }),
              { onNone: () => Effect.void, onSome: store.save },
            )
          },
        })
      })

    /**
     * Reads every row the engine holds, from the start. Boot does this
     * once without local state, and a Processor does it when a row lands
     * behind every snapshot it kept. A snapshot whose watermark the log
     * no longer proves is dropped. True when the read succeeded.
     */
    const readWholeLog = Effect.gen(function* () {
      const read =
        engine.readSince === undefined
          ? Effect.map(engine.read(), result => ({
              messages: result.messages,
              maybeCursor: Option.none<string>(),
            }))
          : engine.readSince(Option.none())
      const result = yield* Effect.result(read)
      if (Result.isFailure(result)) {
        return Option.some(result.failure)
      }
      for (const row of result.success.messages) {
        rememberEngineRow(row)
      }
      if (Option.isSome(result.success.maybeCursor)) {
        maybeCursor = result.success.maybeCursor
        idsPastCursor.clear()
      }
      isLogComplete = true
      isLogRead = true
      savedSnapshots = Array.filter(savedSnapshots, snapshot =>
        LocalSnapshot.isProvenBy(snapshot.watermark, result.success.messages),
      )
      bases = Array.map(savedSnapshots, baseOf)
      return Option.none<SyncTransportError>()
    })

    const sendRefolded = (model: ChildModel): void => {
      sendFromSync(asMessage<Message>({ _tag: 'LogRefolded', model }))
    }

    /**
     * Refolds after a row landed behind the last applied one. When no kept
     * snapshot covers it and this Processor holds only recent rows, it
     * reads the whole log first, behind the current Model.
     */
    const refold = (): void => {
      Option.match(foldLog(), {
        onSome: folded => {
          lastApplied = folded.maxOrder
          sendRefolded(folded.model)
        },
        onNone: () => {
          if (isReadingWholeLog) {
            return
          }
          isReadingWholeLog = true
          Effect.runFork(
            Effect.flatMap(readWholeLog, () =>
              Effect.sync(() => {
                isReadingWholeLog = false
                Option.map(foldLog(), folded => {
                  lastApplied = folded.maxOrder
                  sendRefolded(folded.model)
                })
              }),
            ),
          )
        },
      })
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
          sendFromSync(
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
          sendFromSync(
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
          program.of.version,
        )
        rememberRow(write.message)
        unconfirmedIds.add(idOfRow(write.message))
        const writtenOrder = rowOrderOf(write.message)
        const isBeforeApplied =
          Option.isSome(writtenOrder) &&
          Option.isSome(lastApplied) &&
          !isRowOrderAfter(writtenOrder.value, lastApplied.value)
        if (isBeforeApplied) {
          refold()
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
          sendFromSync(
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

    const maybeLocalState =
      config.localSnapshot === undefined
        ? Option.none<LocalSnapshot.LocalState<ChildModel>>()
        : Option.flatMap(yield* config.localSnapshot.load, text =>
            LocalSnapshot.decode(snapshotProgram, text),
          )
    if (Option.isSome(maybeLocalState)) {
      const local = maybeLocalState.value
      for (const row of local.rows) {
        rememberRow(row)
      }
      savedSnapshots = local.snapshots
      bases = Array.map(local.snapshots, baseOf)
      maybeCursor = local.maybeCursor
      const newest = Array.lastNonEmpty(local.snapshots)
      lastApplied = Option.some(newest.watermark.position)
      sendFromSync(
        asMessage<Message>({ _tag: 'SnapshotReceived', model: newest.model }),
      )
    }

    const isBehindApplied = (row: unknown): boolean =>
      Option.exists(rowOrderOf(row), order =>
        Option.exists(lastApplied, applied => !isRowOrderAfter(order, applied)),
      )

    /** Sends one remote row this Processor has not applied yet. */
    const applyRemoteRow = (row: unknown): void => {
      const decoded = decodeUnknown(program.message, row)
      if (Option.isNone(decoded)) {
        sendFromSync(
          asMessage<Message>(
            decodeFailed({
              what: 'Instant sent a Message this Program cannot read.',
              meaning: 'The row did not match the Message Schema.',
              fix: 'Keep the current count. Check the Message Schema.',
              cause: 'Message Schema decode failed.',
              raw: row,
            }),
          ),
        )
        return
      }
      Option.map(rowOrderOf(row), bumpLastApplied)
      if (appliesHere(currentPolicy(), decoded.value, row)) {
        sendFromSync(
          asMessage<Message>({
            _tag: 'RemoteMessageReceived',
            message: decoded.value,
          }),
        )
      }
    }

    /**
     * Takes rows the engine received after the cursor: rows behind the
     * last applied one landed late, so the log is refolded from the
     * snapshot before them; newer rows are applied in log order.
     */
    const adoptPage = (page: SyncPage): void => {
      const unseen = pipe(
        page.messages,
        Array.filter(
          row =>
            !isKnownRow(row) ||
            readRowString(row, 'from').pipe(Option.contains(engine.processor)),
        ),
      )
      const isAnyLate = Array.some(
        unseen,
        row => !isOwnRow(row) && !isKnownRow(row) && isBehindApplied(row),
      )
      const fresh = Array.filter(unseen, row => !isKnownRow(row))
      for (const row of unseen) {
        rememberEngineRow(row)
      }
      if (Option.isSome(page.maybeCursor)) {
        maybeCursor = page.maybeCursor
        idsPastCursor.clear()
      }
      if (isAnyLate) {
        refold()
      } else {
        pipe(
          fresh,
          Array.filter(row => !isOwnRow(row)),
          Array.filterMap(row =>
            Result.fromOption(
              Option.map(rowOrderOf(row), order => ({ order, row })),
              () => undefined,
            ),
          ),
          Array.sort(logEntryOrder),
          Array.forEach(entry => {
            applyRemoteRow(entry.row)
          }),
        )
      }
    }

    let isCheckingCursor = false

    /**
     * Asks the engine for rows after the cursor, once at a time. A live
     * row behind the last applied one may be a row the snapshot already
     * folded, whose id this device no longer keeps, or a row that landed
     * late; only the engine's cursor tells them apart.
     */
    const checkPastCursor = (): void => {
      const readSince = engine.readSince
      if (readSince === undefined || isCheckingCursor) {
        return
      }
      isCheckingCursor = true
      Effect.runFork(
        readSince(maybeCursor).pipe(
          Effect.map(adoptPage),
          Effect.catch(() => Effect.void),
          Effect.ensuring(
            Effect.sync(() => {
              isCheckingCursor = false
            }),
          ),
        ),
      )
    }

    const onEvent = (event: {
      readonly _tag: string
      readonly row: unknown
    }) => {
      if (event._tag === 'Snapshot') {
        return
      }
      if (isOwnRow(event.row)) {
        rememberEngineRow(event.row)
        return
      }
      if (isKnownRow(event.row)) {
        return
      }
      if (isBehindApplied(event.row)) {
        if (engine.readSince === undefined) {
          rememberRow(event.row)
          refold()
        } else {
          checkPastCursor()
        }
        return
      }
      rememberRow(event.row)
      applyRemoteRow(event.row)
    }

    const saveWhenStale = Effect.suspend(() =>
      config.localSnapshot !== undefined && isLogRead && isLocalSnapshotStale
        ? saveLocalState(config.localSnapshot)
        : Effect.void,
    )

    /**
     * Asks the engine for rows after the cursor and handles each like a
     * live row, so a row the live feed missed still lands, then moves the
     * cursor past them.
     */
    const advanceCursor = Effect.suspend(() => {
      const readSince = engine.readSince
      if (readSince === undefined || !isLogRead || idsPastCursor.size === 0) {
        return Effect.void
      }
      return readSince(maybeCursor).pipe(
        Effect.map(adoptPage),
        Effect.catch(() => Effect.void),
      )
    })

    const readUnseen = Effect.gen(function* () {
      const readSince = engine.readSince
      if (
        readSince === undefined ||
        Option.isNone(maybeLocalState) ||
        Option.isNone(maybeCursor)
      ) {
        return yield* readWholeLog
      }
      const page = yield* Effect.result(readSince(maybeCursor))
      if (Result.isFailure(page)) {
        return Option.some(page.failure)
      }
      for (const row of page.success.messages) {
        rememberEngineRow(row)
      }
      if (Option.isSome(page.success.maybeCursor)) {
        maybeCursor = page.success.maybeCursor
        idsPastCursor.clear()
      }
      isLogRead = true
      return Option.none<SyncTransportError>()
    })

    /**
     * Reads what this device has not seen, folds it onto the newest kept
     * snapshot that covers it, then follows new rows. With local state
     * already on screen, this runs behind it, so a reload paints at once
     * instead of waiting on the network.
     */
    const reconcile = Effect.gen(function* () {
      const knownBefore = knownRows.size
      const maybeReadFailure = yield* readUnseen
      if (Option.isSome(maybeReadFailure)) {
        sendFromSync(
          asMessage<Message>(
            transportFailed({
              what: 'Instant did not return the Message log.',
              meaning: 'This Processor could not start from Instant.',
              fix: 'Check the Instant app and try again.',
              cause: maybeReadFailure.value.cause,
              raw: maybeReadFailure.value.raw,
            }),
          ),
        )
      } else {
        const maybeFolded = yield* Option.match(foldLog(), {
          onSome: folded => Effect.succeed(Option.some(folded)),
          onNone: () => Effect.map(readWholeLog, () => foldLog()),
        })
        Option.map(maybeFolded, folded => {
          lastApplied = folded.maxOrder
          if (Option.isNone(maybeLocalState)) {
            sendFromSync(
              asMessage<Message>({
                _tag: 'SnapshotReceived',
                model: folded.model,
              }),
            )
          } else if (knownRows.size !== knownBefore) {
            sendRefolded(folded.model)
          }
        })
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
        yield* advanceCursor.pipe(
          Effect.repeat(Schedule.spaced(Duration.millis(cursorAdvanceMs))),
          Effect.forkScoped,
        )
      }
    })

    yield* Effect.addFinalizer(() =>
      Effect.andThen(advanceCursor, saveWhenStale),
    )
    if (Option.isSome(maybeLocalState)) {
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
        if (!isLocalOnly(message)) {
          Effect.runFork(persist(message))
        }
      },
      run: (message: Message, options) => {
        if (isRejectedLocally(message)) {
          return Effect.sync(() => runtime.readModel())
        } else if (isLocalOnly(message)) {
          return runtime.run(message, options)
        } else {
          return runtime
            .run(message, options)
            .pipe(Effect.tap(() => persist(message)))
        }
      },
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
