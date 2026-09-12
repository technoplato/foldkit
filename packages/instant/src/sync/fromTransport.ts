import { Deferred, Effect, Schema as S, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'

import {
  InstantCountSnapshotRecord,
  InstantLogMessageRecord,
  SnapshotLogError,
  type SnapshotLogTransport,
  emptyCountSnapshot,
} from '../snapshotLog/snapshotLog.js'

/** Instant app id plus the Processor Host that writes `from`. */
export type InstantApp = Readonly<{
  readonly id: string
}>

/**
 * Dedicated V0.1 Counter Instant app.
 * Schema lives on this app. Do not push onto the Foldkit demo app.
 */
export const FoldkitCounterV01: InstantApp = {
  id: '5417c2e3-c6b9-476d-a962-2e11c83492aa',
}

/** Instant() arguments. Engine is a Host argument. Instant has no Model. */
export type InstantOptions = Readonly<{
  app: InstantApp
  processor: Processor.Host.Host
  instance?: string
  countId?: string
  database?: import('../snapshotLog/snapshotLog.js').InstantSnapshotLogDatabase
  transport?: SnapshotLogTransport
}>

/** Owned Instant rooms stamp `-mine-` into Processor `from`. */
export const isOwnedInstantFrom = (from: string): boolean =>
  from.includes('-mine-')

/** Named-share Instant rooms stamp `-share-` into Processor `from`. */
export const isNamedShareInstantFrom = (from: string): boolean =>
  from.includes('-share-')

/** Public Instant rooms ignore owned and named-share Message rows. */
export const messageBelongsToInstantRoom = (
  from: string,
  processor: string,
): boolean => {
  const shareIndex = processor.indexOf('-share-')
  if (shareIndex >= 0) {
    return from.endsWith(processor.slice(shareIndex))
  }
  const mineIndex = processor.indexOf('-mine-')
  if (mineIndex >= 0) {
    return from.includes(processor.slice(mineIndex))
  }
  return !isOwnedInstantFrom(from) && !isNamedShareInstantFrom(from)
}

/**
 * Instant `from` for one engine occurrence.
 *
 * Two Processors on the same Host, for example two browser tabs,
 * need distinct `from` strings or each drops the other's live rows
 * as its own echo. `instance` disambiguates them.
 */
export const engineProcessorId = (options: InstantOptions): string => {
  const host = Processor.Host.print(options.processor)
  if (options.instance === undefined || options.instance === '') {
    return host
  }
  return `${host}-${options.instance}`
}

/** Instant's own sentence. Never include an admin token. */
export const instantCauseString = (cause: unknown): string => {
  if (typeof cause === 'string') {
    return cause
  }
  if (cause instanceof SnapshotLogError) {
    return instantCauseString(cause.cause)
  }
  if (cause instanceof Error && cause.message !== '') {
    return cause.message
  }
  return 'Instant request failed.'
}

const isBlankSnapshot = (snapshot: InstantCountSnapshotRecord): boolean =>
  snapshot.asOf === emptyCountSnapshot.asOf &&
  snapshot.at === emptyCountSnapshot.at

const toTransportError = (
  cause: unknown,
  operation: Runtime.SyncTransportError['operation'],
  raw?: unknown,
): Runtime.SyncTransportError =>
  new Runtime.SyncTransportError({
    cause: instantCauseString(cause),
    operation,
    ...(raw === undefined ? {} : { raw }),
  })

const decodeSnapshot = (
  row: unknown,
): Effect.Effect<InstantCountSnapshotRecord, Runtime.SyncTransportError> =>
  Effect.try({
    try: () => S.decodeUnknownSync(InstantCountSnapshotRecord)(row),
    catch: cause => toTransportError(cause, 'Decode', row),
  })

const decodeMessage = (
  row: unknown,
): Effect.Effect<InstantLogMessageRecord, Runtime.SyncTransportError> =>
  Effect.try({
    try: () => S.decodeUnknownSync(InstantLogMessageRecord)(row),
    catch: cause => toTransportError(cause, 'Decode', row),
  })

const linkOf = (
  outcome: Readonly<{ readonly _tag: string }>,
): Runtime.SyncLink => {
  if (outcome._tag === 'Synced') {
    return 'delivered'
  }
  return 'queued'
}

/**
 * Wraps a snapshot-log transport as the Runtime.start SyncEngine.
 * Instant has no Model.
 */
export const fromTransport = (
  transport: SnapshotLogTransport,
  processor: string,
): Runtime.SyncEngine => ({
  processor,
  read: () =>
    transport.read().pipe(
      Effect.map(state => ({
        snapshot: isBlankSnapshot(state.snapshot) ? undefined : state.snapshot,
        messages: state.messages.filter(message =>
          messageBelongsToInstantRoom(message.from, processor),
        ),
      })),
      Effect.mapError(error => toTransportError(error, 'Read')),
    ),
  subscribe: enqueue =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>()
      const seenMessageIds = new Set<string>()
      yield* transport.subscribe.pipe(
        Stream.tap(() => Deferred.succeed(ready, undefined)),
        Stream.runForEach(state =>
          Effect.sync(() => {
            enqueue({
              _tag: 'Snapshot',
              row: isBlankSnapshot(state.snapshot) ? undefined : state.snapshot,
            })
            for (const message of state.messages) {
              if (seenMessageIds.has(message.id)) {
                continue
              }
              if (!messageBelongsToInstantRoom(message.from, processor)) {
                continue
              }
              seenMessageIds.add(message.id)
              enqueue({
                _tag: 'Message',
                row: message,
              })
            }
          }),
        ),
        Effect.catch(() => Effect.void),
        Effect.ensuring(Deferred.succeed(ready, undefined)),
        Effect.forkScoped,
      )
      yield* Deferred.await(ready)
    }),
  write: write =>
    decodeSnapshot(write.snapshot).pipe(
      Effect.flatMap(snapshot =>
        decodeMessage(write.message).pipe(
          Effect.flatMap(message =>
            transport.write({ message, snapshot }).pipe(
              Effect.map(outcome => ({
                link: linkOf(outcome),
              })),
              Effect.mapError(error => toTransportError(error, 'Write', write)),
            ),
          ),
        ),
      ),
    ),
})

/** Engine that fails read and write when the Node admin token is missing. */
export const missingAdminToken = (processor: string): Runtime.SyncEngine => ({
  processor,
  read: () =>
    Effect.fail(
      new Runtime.SyncTransportError({
        cause:
          'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
        operation: 'Read',
      }),
    ),
  subscribe: () => Effect.void,
  write: () =>
    Effect.fail(
      new Runtime.SyncTransportError({
        cause:
          'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
        operation: 'Write',
      }),
    ),
})
