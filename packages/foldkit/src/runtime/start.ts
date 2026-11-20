import {
  Array,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  Order,
  Predicate,
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
import type { ObserveSync, SyncTrace, SyncTraceFact } from './syncTrace.js'

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
    foldRevision?: string
  }>

/**
 * Policy knobs for the shared 4-slot snapshot ring. Production defaults work
 * out of the box; tests override stride, jitter, and audit rate for
 * deterministic fast runs.
 */
export type SharedSnapshotPolicy = Readonly<{
  /** Ring slot stride in rows (`slot = Math.floor(count / stride) % 4`). Default `50`. */
  stride?: number
  /** Minimum new rows beyond the highest known shared snapshot before publishing. Default `50`. */
  minDelta?: number
  /** Minimum interval in ms between publishes from one Processor. Default `30_000`. */
  minIntervalMs?: number
  /** Maximum random jitter in ms before checking the ring and publishing. Default `5_000`. */
  jitterMs?: number
  /** Fraction (`0..1`) of cold boots from a shared snapshot that run a background audit. Default `0.05`. */
  auditSampleRate?: number
  /** Random source (`0..1`) for jitter and audit sampling. Default `Math.random`. */
  random?: () => number
  /** Disables shared snapshot reads and writes for this runtime. */
  isDisabled?: boolean
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
  localSnapshot?: LocalSnapshotStore | 'Disabled'
  sharedSnapshot?: SharedSnapshotPolicy
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
    /**
     * Hears what this runtime did with its sync engine, as it happens:
     * each row written and how the write ended, each row received,
     * dropped or refused, and each change of its link.
     */
    observeSync: ObserveSync
    /**
     * Completes once this Processor has asked the sync engine for the log
     * rows it had not seen: `CaughtUp` when it read them and the Model
     * holds them, `CouldNotRead` when the engine could not return them. A
     * Program that starts from its local snapshot paints at once and
     * reads the log behind it, so a host that answers once, such as a
     * command in a terminal, waits on this and never answers from before
     * the last time it ran. It never completes while the engine neither
     * answers nor fails, so such a host bounds its wait.
     */
    caughtUp: Effect.Effect<CatchUp>
  }>

/** How a started Program's first read of the log ended. */
export type CatchUp = 'CaughtUp' | 'CouldNotRead'

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
  const messageRow = asRecord(message)
  const existingId = readRowString(messageRow, 'id')
  const messageId =
    Option.isNone(existingId) || existingId.value === ''
      ? newMessageId()
      : existingId.value
  return {
    snapshot:
      snapshot === undefined
        ? undefined
        : {
            ...asRecord(snapshot),
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

    const isLocalOnlyFromLog = (message: unknown): boolean =>
      childSynchronization?.isLocalOnly?.(message) ?? false

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
    let isSaveBlocked = false
    let isOutboxFrozen = false
    let isAuthChangedTripped = false
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
      ...(program.foldRevision === undefined
        ? {}
        : { foldRevision: program.foldRevision }),
    }
    const sharedPolicy = config.sharedSnapshot ?? {}
    const sharedRingSlots = 4
    const sharedStride = Math.max(1, sharedPolicy.stride ?? 50)
    const sharedMinDelta = Math.max(1, sharedPolicy.minDelta ?? 50)
    const sharedMinIntervalMs = Math.max(0, sharedPolicy.minIntervalMs ?? 30_000)
    const sharedJitterMs = Math.max(0, sharedPolicy.jitterMs ?? 5_000)
    const sharedAuditSampleRate = Math.min(
      1,
      Math.max(0, sharedPolicy.auditSampleRate ?? 0.05),
    )
    const randomSource = sharedPolicy.random ?? Math.random
    let highestKnownSharedCount = 0
    let lastSharedPublishAtMs: number | undefined
    let isPublishingSharedSnapshot = false

    const causeTextOf = (error: unknown): string => {
      if (error instanceof Error && error.message !== '') {
        return error.message
      }
      if (Predicate.isString(error) && error !== '') {
        return error
      }
      return 'Local snapshot operation failed.'
    }

    const isTerminalWriteError = (error: SyncTransportError): boolean =>
      error.operation === 'AuthChanged' || error.isTerminal === true

    const clearConfirmedPastCursor = (
      copiedBeforeRead: ReadonlySet<string>,
      returnedRows: ReadonlyArray<unknown>,
    ): void => {
      for (const row of returnedRows) {
        idsPastCursor.delete(idOfRow(row))
      }
      for (const id of copiedBeforeRead) {
        if (!unconfirmedIds.has(id)) {
          idsPastCursor.delete(id)
        }
      }
    }

    // NOTE: What this runtime does with its engine is told to whoever
    // listens, as it happens: telemetry writes it on the same lines as
    // the Program's transitions, so two devices' files answer whether a
    // row one wrote reached the other, and when. A listener that throws
    // is ignored: watching never changes what the runtime does.
    const syncListeners = new Set<(trace: SyncTrace) => void>()
    const observeSync: ObserveSync = listener => {
      syncListeners.add(listener)
      return () => {
        syncListeners.delete(listener)
      }
    }
    const traceSync = (fact: SyncTraceFact): void => {
      if (syncListeners.size === 0) {
        return
      }
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      const trace = { ...fact, timestamp: clock() } as SyncTrace
      for (const listener of syncListeners) {
        try {
          listener(trace)
        } catch {
          // A listener never fails the runtime it watches.
        }
      }
    }

    const runtime = yield* makeProgramRuntime({
      program,
      resources: (config.resources ?? Layer.empty) as Layer.Layer<Resources>,
      ...(config.observers === undefined
        ? {}
        : {
            observers: Array.map(
              config.observers,
              (observer): ProgramRuntimeObserver<Model, Message> =>
                observation =>
                  observer({ ...observation, observeSync }),
            ),
          }),
    })
    yield* runtime.initialization

    const maybeSnapshotScope: Option.Option<LocalSnapshot.LocalSnapshotScope> =
      engine.snapshotScope === undefined
        ? Option.none()
        : yield* engine.snapshotScope.pipe(
            Effect.catchCause(() =>
              Effect.succeed(Option.none<LocalSnapshot.LocalSnapshotScope>()),
            ),
          )

    const maybeLocalSnapshotStore: Option.Option<LocalSnapshotStore> =
      config.localSnapshot === 'Disabled'
        ? Option.none()
        : config.localSnapshot !== undefined
          ? Option.some(config.localSnapshot)
          : engine.localSnapshot === undefined
            ? Option.none()
            : yield* engine.localSnapshot.pipe(
                Effect.catchCause(cause => {
                  traceSync({
                    _tag: 'FailedLocalSnapshot',
                    operation: 'Load',
                    cause: causeTextOf(cause),
                  })
                  return Effect.succeed(Option.none<LocalSnapshotStore>())
                }),
              )

    const tagOfMessage = (message: unknown): string =>
      Predicate.hasProperty(message, '_tag') && typeof message._tag === 'string'
        ? message._tag
        : ''

    const tagOfRow = (row: unknown): string =>
      Option.match(decodeUnknown(program.message, row), {
        onNone: () => '',
        onSome: tagOfMessage,
      })

    const fromOfRow = (row: unknown): string =>
      Option.getOrElse(readRowString(row, 'from'), () => '')

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
          isLocalOnlyFromLog(decoded.value) ||
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
        if (isSaveBlocked) {
          return Effect.void
        }
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
              LocalSnapshot.encode(
                snapshotProgram,
                {
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
                },
                Option.getOrUndefined(maybeSnapshotScope),
              ),
              {
                onNone: () => Effect.void,
                onSome: encoded =>
                  store.save(encoded).pipe(
                    Effect.tap(() =>
                      Effect.sync(() => {
                        traceSync({ _tag: 'SavedLocalSnapshot' })
                      }),
                    ),
                    Effect.catchCause(cause =>
                      Effect.sync(() => {
                        traceSync({
                          _tag: 'FailedLocalSnapshot',
                          operation: 'Save',
                          cause: causeTextOf(cause),
                        })
                      }),
                    ),
                  ),
              },
            )
          },
        })
      })

    const tripAuthChanged = (reason: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (isAuthChangedTripped) {
          return
        }
        isAuthChangedTripped = true
        isSaveBlocked = true
        isOutboxFrozen = true
        outbox.length = 0
        traceSync({ _tag: 'AuthChanged', cause: reason })
        if (Option.isSome(maybeLocalSnapshotStore)) {
          const remove = maybeLocalSnapshotStore.value.remove
          if (remove !== undefined) {
            yield* remove.pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  traceSync({ _tag: 'RemovedLocalSnapshot', reason })
                }),
              ),
              Effect.catchCause(cause =>
                Effect.sync(() => {
                  traceSync({
                    _tag: 'FailedLocalSnapshot',
                    operation: 'Remove',
                    cause: causeTextOf(cause),
                  })
                }),
              ),
            )
          }
        }
        sendFromSync(
          asMessage<Message>(
            transportFailed({
              what: 'The signed-in account changed.',
              meaning:
                'This Processor stopped saving and syncing so another account cannot mix with this session.',
              fix: 'Reload or sign back in to start a session for the current account.',
              cause: reason,
            }),
          ),
        )
      })

    /**
     * Reads every row the engine holds, from the start. Boot does this
     * once without local state, and a Processor does it when a row lands
     * behind every snapshot it kept. A snapshot whose watermark the log
     * no longer proves is dropped. True when the read succeeded.
     */
    const readWholeLog = Effect.gen(function* () {
      const pastCursorBeforeRead = new Set(idsPastCursor)
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
        clearConfirmedPastCursor(pastCursorBeforeRead, result.success.messages)
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
        if (!isChildMessage(message) || isOutboxFrozen) {
          return
        }
        const model = runtime.readModel() as SyncedModel<unknown, Message>
        if (model._tag !== 'Ready') {
          return
        }
        const { _tag: _readyTag, ...childModel } = model
        let encodedSnapshotValue: unknown = undefined
        if (engine.writesSnapshot !== false) {
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
          encodedSnapshotValue = encodedSnapshot.success
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
          encodedSnapshotValue,
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
        const wroteRow = {
          rowId: idOfRow(write.message),
          message: tagOfMessage(message),
        }
        if (Array.isArrayNonEmpty(outbox)) {
          outbox.push(write)
          lastWrite = Option.some({ link: 'queued' })
          traceSync({ _tag: 'QueuedRow', ...wroteRow })
          return
        }
        const writeStartedAt = clock()
        const written = yield* engine.write(write).pipe(Effect.result)
        if (Result.isFailure(written)) {
          traceSync({
            _tag: 'FailedToWriteRow',
            ...wroteRow,
            cause: written.failure.cause,
          })
          if (isTerminalWriteError(written.failure)) {
            yield* tripAuthChanged(written.failure.cause)
            return
          }
          outbox.push(write)
          lastWrite = Option.some({ link: 'queued' })
          sendFromSync(
            asMessage<Message>(
              transportFailed({
                what: 'The sync engine did not accept this Message.',
                meaning:
                  'The local Model is Ready. The sync engine rejected the write or the network is down.',
                fix: 'Keep the local number. Retry the same Message id when the sync engine is back.',
                sent: message,
                cause: written.failure.cause,
                raw: write,
              }),
            ),
          )
          return
        }
        lastWrite = Option.some(written.success)
        traceSync({
          _tag: 'WroteRow',
          ...wroteRow,
          link: written.success.link,
          isRetry: false,
          tookMs: Math.max(0, clock() - writeStartedAt),
        })
      })

    const flushOutbox = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (isOutboxFrozen || Array.isArrayEmpty(outbox)) {
          return
        }
        const pending = outbox.splice(0, outbox.length)
        for (const write of pending) {
          const retryStartedAt = clock()
          const written = yield* engine.write(write).pipe(Effect.result)
          if (Result.isFailure(written)) {
            if (isTerminalWriteError(written.failure)) {
              yield* tripAuthChanged(written.failure.cause)
              return
            }
            outbox.unshift(write)
            lastWrite = Option.some({ link: 'queued' })
            return
          }
          lastWrite = Option.some(written.success)
          traceSync({
            _tag: 'WroteRow',
            rowId: idOfRow(write.message),
            message: tagOfRow(write.message),
            link: written.success.link,
            isRetry: true,
            tookMs: Math.max(0, clock() - retryStartedAt),
          })
        }
      })

    const maybeLocalState: Option.Option<LocalSnapshot.LocalState<ChildModel>> =
      yield* Option.match(maybeLocalSnapshotStore, {
        onNone: () =>
          Effect.succeed(Option.none<LocalSnapshot.LocalState<ChildModel>>()),
        onSome: store =>
          store.load.pipe(
            Effect.map(maybeText =>
              Option.match(maybeText, {
                onNone: () => {
                  traceSync({ _tag: 'LoadedLocalSnapshot', hit: false })
                  return Option.none<LocalSnapshot.LocalState<ChildModel>>()
                },
                onSome: text => {
                  const decoded = LocalSnapshot.decode(
                    snapshotProgram,
                    text,
                    Option.getOrUndefined(maybeSnapshotScope),
                  )
                  if (Option.isSome(decoded)) {
                    traceSync({ _tag: 'LoadedLocalSnapshot', hit: true })
                  } else {
                    traceSync({
                      _tag: 'FailedLocalSnapshot',
                      operation: 'Decode',
                      cause:
                        'Stored local snapshot did not match Program, version, revision, or scope.',
                    })
                  }
                  return decoded
                },
              }),
            ),
            Effect.catchCause(cause =>
              Effect.sync(() => {
                traceSync({
                  _tag: 'FailedLocalSnapshot',
                  operation: 'Load',
                  cause: causeTextOf(cause),
                })
                return Option.none<LocalSnapshot.LocalState<ChildModel>>()
              }),
            ),
          ),
      })
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
        traceSync({
          _tag: 'DroppedRow',
          rowId: idOfRow(row),
          from: fromOfRow(row),
          cause: 'Message Schema decode failed.',
        })
        sendFromSync(
          asMessage<Message>(
            decodeFailed({
              what: 'The sync engine sent a Message this Program cannot read.',
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
      if (isLocalOnlyFromLog(decoded.value)) {
        return
      }
      const receivedRow = {
        rowId: idOfRow(row),
        message: tagOfMessage(decoded.value),
        from: fromOfRow(row),
      }
      if (appliesHere(currentPolicy(), decoded.value, row)) {
        traceSync({ _tag: 'ReceivedRow', ...receivedRow, isLate: false })
        sendFromSync(
          asMessage<Message>({
            _tag: 'RemoteMessageReceived',
            message: decoded.value,
          }),
        )
      } else {
        traceSync({
          _tag: 'RefusedRow',
          ...receivedRow,
          cause:
            "The session's policy keeps this Message on the Processor that sent it.",
        })
      }
    }

    // A row that landed behind the last one applied is folded in by
    // refolding the log, so it is told here, where it arrived.
    const traceLateRow = (row: unknown): void => {
      traceSync({
        _tag: 'ReceivedRow',
        rowId: idOfRow(row),
        message: tagOfRow(row),
        from: fromOfRow(row),
        isLate: true,
      })
    }

    /**
     * Takes rows the engine received after the cursor: rows behind the
     * last applied one landed late, so the log is refolded from the
     * snapshot before them; newer rows are applied in log order.
     */
    const adoptPage = (
      page: SyncPage,
      pastCursorBeforeRead: ReadonlySet<string>,
    ): void => {
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
        clearConfirmedPastCursor(pastCursorBeforeRead, page.messages)
      }
      if (isAnyLate) {
        Array.forEach(
          Array.filter(fresh, row => !isOwnRow(row)),
          traceLateRow,
        )
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
      scheduleSharedSnapshotPublish()
    }

    const runtimeScope = yield* Scope.Scope

    type LoadedSharedSnapshot = Readonly<{
      slot: number
      entry: LocalSnapshot.SharedSnapshotEntry<ChildModel>
    }>

    const maybeLoadedSharedRef: { current: Option.Option<LoadedSharedSnapshot> } =
      { current: Option.none() }

    const modelJsonEquals = (left: ChildModel, right: ChildModel): boolean => {
      const ModelJson = S.toCodecJson(program.of.Model)
      return pipe(
        Result.try(
          () =>
            JSON.stringify(S.encodeSync(ModelJson)(left)) ===
            JSON.stringify(S.encodeSync(ModelJson)(right)),
        ),
        Result.getOrElse(() => false),
      )
    }

    const runSharedSnapshotPublish = (
      candidate: LocalSnapshot.SharedSnapshotEntry<ChildModel>,
      force: boolean,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const foldRevision = program.foldRevision
        const writeShared = engine.writeSharedSnapshot
        if (foldRevision === undefined || writeShared === undefined) {
          return
        }
        if (!force && sharedJitterMs > 0) {
          const delayMs = Math.floor(randomSource() * sharedJitterMs)
          if (delayMs > 0) {
            yield* Effect.sleep(Duration.millis(delayMs))
          }
        }
        if (isSaveBlocked) {
          return
        }
        if (!force && engine.readSharedSnapshots !== undefined) {
          const ringResult = yield* Effect.result(
            engine.readSharedSnapshots({
              programVersion: program.of.version,
              foldRevision,
            }),
          )
          if (Result.isSuccess(ringResult)) {
            let maxCount = highestKnownSharedCount
            for (const existing of ringResult.success) {
              if (existing.count > maxCount) {
                maxCount = existing.count
              }
            }
            highestKnownSharedCount = maxCount
            if (maxCount >= candidate.watermark.count) {
              return
            }
          }
        }
        const maybePayload = LocalSnapshot.encodeShared(
          snapshotProgram,
          candidate,
          Option.getOrUndefined(maybeSnapshotScope),
        )
        if (Option.isNone(maybePayload)) {
          return
        }
        const slot =
          Math.floor(candidate.watermark.count / sharedStride) % sharedRingSlots
        const writeResult = yield* Effect.result(
          writeShared({
            slot,
            programVersion: program.of.version,
            foldRevision,
            count: candidate.watermark.count,
            writtenBy: engine.processor,
            writtenAtMs: clock(),
            payload: maybePayload.value,
          }),
        )
        if (Result.isFailure(writeResult)) {
          traceSync({
            _tag: 'FailedSharedSnapshot',
            operation: 'Write',
            cause: writeResult.failure.cause,
          })
          return
        }
        highestKnownSharedCount = Math.max(
          highestKnownSharedCount,
          candidate.watermark.count,
        )
        lastSharedPublishAtMs = clock()
        traceSync({
          _tag: 'SavedSharedSnapshot',
          slot,
          count: candidate.watermark.count,
        })
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            isPublishingSharedSnapshot = false
          }),
        ),
      )

    const scheduleSharedSnapshotPublish = (force = false): void => {
      if (
        sharedPolicy.isDisabled === true ||
        isSaveBlocked ||
        isPublishingSharedSnapshot ||
        program.foldRevision === undefined ||
        engine.writeSharedSnapshot === undefined ||
        !isLogRead ||
        idsPastCursor.size > 0 ||
        unconfirmedIds.size > 0 ||
        Option.isNone(maybeCursor)
      ) {
        return
      }
      if (
        !force &&
        lastSharedPublishAtMs !== undefined &&
        clock() - lastSharedPublishAtMs < sharedMinIntervalMs
      ) {
        return
      }
      const entries = orderedRows()
      if (!force) {
        const newestBaseCount = Option.match(Array.last(bases), {
          onNone: () => 0,
          onSome: base => base.watermark.count,
        })
        const estimatedCount = Math.max(
          entries.length,
          newestBaseCount +
            Option.match(Array.last(bases), {
              onNone: () => 0,
              onSome: base => entriesAfter(entries, base.position).length,
            }),
        )
        if (estimatedCount < highestKnownSharedCount + sharedMinDelta) {
          return
        }
      }
      const maybeFolded = foldFromBase(entries, strangerViewpoint)
      if (Option.isNone(maybeFolded) || Option.isNone(maybeFolded.value.watermark)) {
        return
      }
      const watermark = maybeFolded.value.watermark.value
      if (!force && watermark.count < highestKnownSharedCount + sharedMinDelta) {
        return
      }
      isPublishingSharedSnapshot = true
      const candidate: LocalSnapshot.SharedSnapshotEntry<ChildModel> = {
        model: maybeFolded.value.model,
        watermark,
        cursor: maybeCursor.value,
      }
      Effect.runFork(
        Effect.forkIn(runSharedSnapshotPublish(candidate, force), runtimeScope),
      )
    }

    const tryColdBootFromSharedSnapshot: Effect.Effect<
      Option.Option<LoadedSharedSnapshot>
    > = Effect.gen(function* () {
      const foldRevision = program.foldRevision
      const readShared = engine.readSharedSnapshots
      const readSince = engine.readSince
      if (
        sharedPolicy.isDisabled === true ||
        foldRevision === undefined ||
        readShared === undefined ||
        readSince === undefined
      ) {
        return Option.none<LoadedSharedSnapshot>()
      }
      if (engine.hasOwnRows !== undefined) {
        const hasOwn = yield* Effect.result(engine.hasOwnRows)
        if (Result.isFailure(hasOwn) || hasOwn.success) {
          return Option.none<LoadedSharedSnapshot>()
        }
      }
      const ringResult = yield* Effect.result(
        readShared({
          programVersion: program.of.version,
          foldRevision,
        }),
      )
      if (Result.isFailure(ringResult)) {
        traceSync({
          _tag: 'FailedSharedSnapshot',
          operation: 'Read',
          cause: ringResult.failure.cause,
        })
        return Option.none<LoadedSharedSnapshot>()
      }
      const decodedCandidates: Array<LoadedSharedSnapshot> = []
      const expectedScope = Option.getOrUndefined(maybeSnapshotScope)
      for (const row of ringResult.success) {
        if (
          row.programVersion !== program.of.version ||
          row.foldRevision !== foldRevision
        ) {
          continue
        }
        const maybeEntry = LocalSnapshot.decodeShared(
          snapshotProgram,
          row.payload,
          expectedScope,
        )
        if (Option.isNone(maybeEntry)) {
          traceSync({
            _tag: 'FailedSharedSnapshot',
            operation: 'Decode',
            cause:
              'Shared snapshot did not match Program, version, revision, or scope.',
          })
          continue
        }
        decodedCandidates.push({ slot: row.slot, entry: maybeEntry.value })
        if (maybeEntry.value.watermark.count > highestKnownSharedCount) {
          highestKnownSharedCount = maybeEntry.value.watermark.count
        }
      }
      if (Array.isArrayEmpty(decodedCandidates)) {
        return Option.none<LoadedSharedSnapshot>()
      }
      const sorted = Array.sort(
        decodedCandidates,
        Order.mapInput(
          Order.Number,
          (candidate: LoadedSharedSnapshot) => -candidate.entry.watermark.count,
        ),
      )
      for (const candidate of sorted) {
        const pageResult = yield* Effect.result(
          readSince(Option.some(candidate.entry.cursor)),
        )
        if (Result.isFailure(pageResult)) {
          continue
        }
        const page = pageResult.success
        const isEveryRowAfter = Array.every(page.messages, row =>
          Option.exists(rowOrderOf(row), order =>
            isRowOrderAfter(order, candidate.entry.watermark.position),
          ),
        )
        if (!isEveryRowAfter) {
          continue
        }
        const snapshot: LocalSnapshot.LocalSnapshot<ChildModel> = {
          model: candidate.entry.model,
          watermark: candidate.entry.watermark,
        }
        knownRows.clear()
        for (const row of page.messages) {
          rememberEngineRow(row)
        }
        savedSnapshots = [snapshot]
        bases = [baseOf(snapshot)]
        maybeCursor = Option.orElse(page.maybeCursor, () =>
          Option.some(candidate.entry.cursor),
        )
        idsPastCursor.clear()
        isLogRead = true
        traceSync({
          _tag: 'LoadedSharedSnapshot',
          slot: candidate.slot,
          count: candidate.entry.watermark.count,
        })
        return Option.some(candidate)
      }
      return Option.none<LoadedSharedSnapshot>()
    })

    const auditLoadedSharedSnapshot = (
      loaded: LoadedSharedSnapshot,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const wholeResult =
          engine.readSince !== undefined
            ? yield* Effect.result(engine.readSince(Option.none()))
            : yield* Effect.result(
                Effect.map(engine.read(), state => ({
                  messages: state.messages,
                  maybeCursor: Option.none<string>(),
                })),
              )
        if (Result.isFailure(wholeResult)) {
          return
        }
        const wholeRows = wholeResult.success.messages
        const isWatermarkProven = LocalSnapshot.isProvenBy(
          loaded.entry.watermark,
          wholeRows,
        )
        const entriesAtOrBefore = pipe(
          wholeRows,
          Array.filter(row =>
            LocalSnapshot.isAtOrBefore(row, loaded.entry.watermark.position),
          ),
          Array.filterMap(row =>
            Result.fromOption(
              Option.map(rowOrderOf(row), order => ({ order, row })),
              () => undefined,
            ),
          ),
          Array.sort(logEntryOrder),
        )
        const expectedModel = foldRows(
          initialChildModel,
          entriesAtOrBefore,
          strangerViewpoint,
        )
        const isModelMatch = modelJsonEquals(expectedModel, loaded.entry.model)
        if (isWatermarkProven && isModelMatch) {
          return
        }
        traceSync({
          _tag: 'FailedSharedSnapshot',
          operation: 'Audit',
          cause: !isWatermarkProven
            ? 'Shared snapshot watermark did not match authoritative log.'
            : 'Shared snapshot Model did not match authoritative fold.',
        })
        for (const row of wholeRows) {
          rememberEngineRow(row)
        }
        isLogComplete = true
        bases = []
        savedSnapshots = []
        if (Option.isSome(wholeResult.success.maybeCursor)) {
          maybeCursor = wholeResult.success.maybeCursor
        }
        idsPastCursor.clear()
        Option.map(foldLog(), folded => {
          lastApplied = folded.maxOrder
          sendRefolded(folded.model)
        })
        yield* saveWhenStale
        scheduleSharedSnapshotPublish(true)
      })

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
      const pastCursorBeforeRead = new Set(idsPastCursor)
      Effect.runFork(
        readSince(maybeCursor).pipe(
          Effect.map(page => {
            adoptPage(page, pastCursorBeforeRead)
          }),
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
        if (unconfirmedIds.has(idOfRow(event.row))) {
          traceSync({ _tag: 'ConfirmedRow', rowId: idOfRow(event.row) })
        }
        rememberEngineRow(event.row)
        return
      }
      if (isKnownRow(event.row)) {
        return
      }
      if (isBehindApplied(event.row)) {
        if (engine.readSince === undefined) {
          rememberRow(event.row)
          traceLateRow(event.row)
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
      Option.isSome(maybeLocalSnapshotStore) &&
      !isSaveBlocked &&
      isLogRead &&
      isLocalSnapshotStale
        ? saveLocalState(maybeLocalSnapshotStore.value)
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
      const pastCursorBeforeRead = new Set(idsPastCursor)
      return readSince(maybeCursor).pipe(
        Effect.map(page => {
          adoptPage(page, pastCursorBeforeRead)
        }),
        Effect.catch(() => Effect.void),
      )
    })

    const readUnseen = Effect.gen(function* () {
      const readSince = engine.readSince
      if (Option.isNone(maybeLocalState)) {
        const maybeLoaded = yield* tryColdBootFromSharedSnapshot
        if (Option.isSome(maybeLoaded)) {
          maybeLoadedSharedRef.current = maybeLoaded
          return Option.none<SyncTransportError>()
        }
        return yield* readWholeLog
      }
      if (readSince === undefined || Option.isNone(maybeCursor)) {
        return yield* readWholeLog
      }
      const pastCursorBeforeRead = new Set(idsPastCursor)
      const page = yield* Effect.result(readSince(maybeCursor))
      if (Result.isFailure(page)) {
        return Option.some(page.failure)
      }
      for (const row of page.success.messages) {
        rememberEngineRow(row)
      }
      if (Option.isSome(page.success.maybeCursor)) {
        maybeCursor = page.success.maybeCursor
        clearConfirmedPastCursor(pastCursorBeforeRead, page.success.messages)
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
    const caughtUp = yield* Deferred.make<CatchUp>()

    const reconcile = Effect.gen(function* () {
      const knownBefore = knownRows.size
      const maybeReadFailure = yield* readUnseen
      if (Option.isSome(maybeReadFailure)) {
        sendFromSync(
          asMessage<Message>(
            transportFailed({
              what: 'The sync engine did not return the Message log.',
              meaning: 'This Processor could not start from the sync engine.',
              fix: 'Check the sync engine and try again.',
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
      yield* Deferred.succeed(
        caughtUp,
        Option.isSome(maybeReadFailure) ? 'CouldNotRead' : 'CaughtUp',
      )

      yield* engine.subscribe(onEvent)
      if (engine.links !== undefined) {
        yield* engine.links(link => {
          traceSync({ _tag: 'LinkChanged', link })
        })
      }
      yield* flushOutbox().pipe(
        Effect.repeat(Schedule.spaced(Duration.millis(outboxFlushMs))),
        Effect.forkScoped,
      )
      const canPublishShared =
        sharedPolicy.isDisabled !== true &&
        program.foldRevision !== undefined &&
        engine.writeSharedSnapshot !== undefined
      if (Option.isSome(maybeLocalSnapshotStore)) {
        yield* saveWhenStale
        yield* saveWhenStale.pipe(
          Effect.repeat(Schedule.spaced(Duration.millis(localSnapshotSaveMs))),
          Effect.forkScoped,
        )
      }
      if (Option.isSome(maybeLocalSnapshotStore) || canPublishShared) {
        yield* advanceCursor.pipe(
          Effect.repeat(Schedule.spaced(Duration.millis(cursorAdvanceMs))),
          Effect.forkScoped,
        )
      }
      scheduleSharedSnapshotPublish()
      if (
        Option.isSome(maybeLoadedSharedRef.current) &&
        sharedAuditSampleRate > 0 &&
        randomSource() < sharedAuditSampleRate
      ) {
        yield* Effect.forkScoped(
          auditLoadedSharedSnapshot(maybeLoadedSharedRef.current.value),
        )
      }
    })

    if (engine.watchAuthChanged !== undefined) {
      yield* engine.watchAuthChanged(reason => {
        Effect.runFork(tripAuthChanged(reason))
      })
    }
    yield* Effect.addFinalizer(() =>
      Effect.andThen(advanceCursor, saveWhenStale),
    )
    if (Option.isSome(maybeLocalState)) {
      yield* Effect.forkScoped(reconcile)
    } else {
      yield* reconcile
    }

    // NOTE: A Message's row is written the moment its update has been
    // applied, before the Commands that update returned are started. The
    // row tells every other device what was pressed; writing it only
    // after the Message's whole operation had ended made a pause, which
    // saves the place, reach the others seconds later than a play. The
    // journal tells its observers as a transition is recorded, which is
    // after the update and before its Commands.
    const awaitingWrite = new Map<Message, Array<Deferred.Deferred<void>>>()
    const writtenWhenTaken = (message: Message): Deferred.Deferred<void> => {
      const written = Deferred.makeUnsafe<void>()
      awaitingWrite.set(message, [
        ...(awaitingWrite.get(message) ?? []),
        written,
      ])
      return written
    }
    const stopWritingWhenTaken = runtime.journal.observe(transition => {
      const waiting = awaitingWrite.get(transition.message)
      if (waiting === undefined) {
        return
      }
      const [written, ...others] = waiting
      if (Array.isReadonlyArrayEmpty(others)) {
        awaitingWrite.delete(transition.message)
      } else {
        awaitingWrite.set(transition.message, others)
      }
      if (written !== undefined) {
        Effect.runFork(
          persist(transition.message).pipe(
            Effect.ensuring(Deferred.succeed(written, undefined)),
          ),
        )
      }
    })
    yield* Effect.addFinalizer(() => Effect.sync(stopWritingWhenTaken))

    return {
      ...runtime,
      send: (message: Message, options) => {
        if (isRejectedLocally(message)) {
          return
        }
        if (!isLocalOnly(message)) {
          writtenWhenTaken(message)
        }
        runtime.send(message, options)
      },
      run: (message: Message, options) => {
        if (isRejectedLocally(message)) {
          return Effect.sync(() => runtime.readModel())
        } else if (isLocalOnly(message)) {
          return runtime.run(message, options)
        } else {
          return Effect.suspend(() => {
            const written = writtenWhenTaken(message)
            return runtime
              .run(message, options)
              .pipe(Effect.tap(() => Deferred.await(written)))
          })
        }
      },
      lastWrite: () => lastWrite,
      caughtUp: Deferred.await(caughtUp),
      observeSync,
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
