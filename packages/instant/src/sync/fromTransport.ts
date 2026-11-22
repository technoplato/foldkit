import { Deferred, Effect, Option, Schema as S, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'

import {
  ProgramLogAuthChangedError,
  type ProgramLogDatabase,
  type ProgramLogOwner,
} from '../programLog/core.js'
import {
  type CountIdSelector,
  InstantCountSnapshotRecord,
  InstantLogMessageRecord,
  type InstantSnapshotLogDatabase,
  SnapshotLogError,
  type SnapshotLogTransport,
  emptyCountSnapshot,
} from '../snapshotLog/snapshotLog.js'

/** Instant app id plus the Processor Host that writes `from`. */
export type InstantApp = Readonly<{
  readonly id: string
}>

/**
 * The one Instant project every example syncs through. The Counter keeps
 * its original `count` and `message` tables, which deployed Counter
 * clients read; every other app writes `programMessage` rows that name the
 * app, so one project carries them all. Do not push onto the Foldkit demo
 * app.
 */
export const SharedInstantProject: InstantApp = {
  id: '5417c2e3-c6b9-476d-a962-2e11c83492aa',
}

/**
 * Instant() arguments. Engine is a Host argument. Instant has no Model.
 * `programLog` names the app whose rows this engine reads and writes on
 * the shared `programMessage` log, such as `multiple-counters`; without it
 * the engine uses the Counter's own tables. `owner: 'SignedInUser'` stamps
 * each row with the signed-in member, for a schema whose rules let each
 * person read and write only their own rows.
 *
 * @example
 * ```typescript
 * Instant({ app, processor, instance, database, programLog: 'books', owner: 'SignedInUser' })
 * ```
 */
export type InstantOptions = Readonly<{
  app: InstantApp
  processor: Processor.Host.Host
  instance?: string
  countId?: string
  selectCountId?: CountIdSelector
  transport?: SnapshotLogTransport
}> &
  (
    | Readonly<{
        programLog: string
        owner?: ProgramLogOwner
        database?: ProgramLogDatabase
      }>
    | Readonly<{
        programLog?: undefined
        owner?: undefined
        database?: InstantSnapshotLogDatabase
      }>
  )

/** Owned Instant rooms stamp `-mine-` into Processor `from`. */
export const isOwnedInstantFrom = (from: string): boolean =>
  from.includes('-mine-')

/** Named-share Instant rooms stamp `-share-` into Processor `from`. */
export const isNamedShareInstantFrom = (from: string): boolean =>
  from.includes('-share-')

/**
 * Canonical Instant room derived from a Processor's `from` string, dropping
 * any random instance suffix so every boot in the same room resolves to the
 * same cache key and shared snapshot ring.
 *
 * @example
 * ```typescript
 * instantRoomOf('react-4f2a9c1e') // 'public'
 * instantRoomOf('cli-mine-alice') // 'mine-alice'
 * instantRoomOf('tui-share-kitchen') // 'share-kitchen'
 * ```
 */
export const instantRoomOf = (processor: string): string => {
  const shareIndex = processor.indexOf('-share-')
  if (shareIndex >= 0) {
    return processor.slice(shareIndex + 1)
  }
  const mineIndex = processor.indexOf('-mine-')
  if (mineIndex >= 0) {
    return processor.slice(mineIndex + 1)
  }
  return 'public'
}

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

const isAuthChangedCause = (
  cause: unknown,
): cause is ProgramLogAuthChangedError => {
  if (cause instanceof ProgramLogAuthChangedError) {
    return true
  }
  if (cause instanceof SnapshotLogError) {
    return isAuthChangedCause(cause.cause)
  }
  return false
}

const toTransportError = (
  cause: unknown,
  operation: Runtime.SyncTransportError['operation'],
  raw?: unknown,
): Runtime.SyncTransportError => {
  if (isAuthChangedCause(cause)) {
    return new Runtime.SyncTransportError({
      cause: cause.message,
      operation: 'AuthChanged',
      isTerminal: true,
      ...(raw === undefined ? {} : { raw }),
    })
  }
  return new Runtime.SyncTransportError({
    cause: instantCauseString(cause),
    operation,
    ...(raw === undefined ? {} : { raw }),
  })
}

const decodeSnapshot = (
  row: unknown,
): Effect.Effect<InstantCountSnapshotRecord, Runtime.SyncTransportError> =>
  Effect.try({
    try: () => S.decodeUnknownSync(InstantCountSnapshotRecord)(row),
    catch: cause => toTransportError(cause, 'Decode', row),
  })

const withoutClientFields = ({
  client: _client,
  browser: _browser,
  windowLabel: _windowLabel,
  terminal: _terminal,
  appVersion: _appVersion,
  ...own
}: InstantLogMessageRecord): InstantLogMessageRecord => own

const decodeMessage = (
  row: unknown,
  keepsClientFields: boolean,
): Effect.Effect<InstantLogMessageRecord, Runtime.SyncTransportError> =>
  Effect.try({
    try: () => {
      const record = S.decodeUnknownSync(InstantLogMessageRecord)(row)
      return keepsClientFields ? record : withoutClientFields(record)
    },
    catch: cause => toTransportError(cause, 'Decode', row),
  })

/**
 * Whether an engine on `app` writes what a row says about its Client:
 * yes on the shared project, whose schema this package owns and which has
 * the columns, and no on any other app, whose schema may refuse a column
 * it does not name, as a library's own app would.
 *
 * @example
 * ```typescript
 * fromTransport(transport, processor, links, { ...hooks, ...clientFieldsKeptFor(options.app) })
 * ```
 */
export const clientFieldsKeptFor = (
  app: InstantApp,
): Pick<FromTransportOptions, 'keepsClientFields'> => ({
  keepsClientFields: app.id === SharedInstantProject.id,
})

const linkOf = (
  outcome: Readonly<{ readonly _tag: string }>,
): Runtime.SyncLink => {
  if (outcome._tag === 'Synced') {
    return 'delivered'
  }
  return 'queued'
}

const readSinceOf = (
  transport: SnapshotLogTransport,
  processor: string,
): Option.Option<NonNullable<Runtime.SyncEngine['readSince']>> =>
  Option.map(
    Option.fromNullishOr(transport.readSince),
    readSince => (maybeCursor: Option.Option<string>) =>
      readSince(maybeCursor).pipe(
        Effect.map(page => ({
          messages: page.messages.filter(message =>
            messageBelongsToInstantRoom(message.from, processor),
          ),
          maybeCursor: Option.some(page.cursor),
        })),
        Effect.mapError(error => toTransportError(error, 'Read')),
      ),
  )

/**
 * Where the link stands for each word Instant uses for its connection:
 * `connecting`, `opened` (connected, not yet signed in), `authenticated`
 * (signed in), and `closed` or `errored` (offline). None for a word this
 * build does not know, which is then not told.
 *
 * @example
 * ```typescript
 * linkOfInstantStatus('authenticated') // Some('SignedIn')
 * ```
 */
export const linkOfInstantStatus = (
  status: unknown,
): Option.Option<Runtime.SyncLinkState> => {
  if (status === 'connecting') {
    return Option.some('Connecting')
  } else if (status === 'opened') {
    return Option.some('Connected')
  } else if (status === 'authenticated') {
    return Option.some('SignedIn')
  } else if (status === 'closed' || status === 'errored') {
    return Option.some('Offline')
  } else {
    return Option.none()
  }
}

/** The part of an Instant database that says how its connection stands. */
export type InstantConnection = Readonly<{
  subscribeConnectionStatus: (listener: (status: unknown) => void) => () => void
}>

/**
 * An Instant database's connection as a sync engine's link: its state
 * now, then each change once, until the Scope closes. A sync runtime
 * writes it into its trace, so a device's file says when it was
 * connected, signed in, offline and back.
 *
 * @example
 * ```typescript
 * fromTransport(transport, processor, instantLinksOf(database))
 * ```
 */
export const instantLinksOf =
  (database: InstantConnection): NonNullable<Runtime.SyncEngine['links']> =>
  listener =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const last: { maybeLink: Option.Option<Runtime.SyncLinkState> } = {
          maybeLink: Option.none(),
        }
        return database.subscribeConnectionStatus(status => {
          const maybeLink = linkOfInstantStatus(status)
          if (
            Option.isSome(maybeLink) &&
            !Option.contains(last.maybeLink, maybeLink.value)
          ) {
            last.maybeLink = maybeLink
            listener(maybeLink.value)
          }
        })
      }),
      unsubscribe => Effect.sync(unsubscribe),
    )

export type FromTransportOptions = Readonly<{
  writesSnapshot?: boolean
  /**
   * Whether a written row keeps what it says about its Client, such as
   * `client: 'tui'`. Off unless said, so a row holds the log's own fields
   * only on an app whose schema has no such columns.
   */
  keepsClientFields?: boolean
  localSnapshot?: Runtime.SyncEngine['localSnapshot']
  snapshotScope?: Runtime.SyncEngine['snapshotScope']
  watchAuthChanged?: Runtime.SyncEngine['watchAuthChanged']
  hasOwnRows?: Runtime.SyncEngine['hasOwnRows']
  readSharedSnapshots?: Runtime.SyncEngine['readSharedSnapshots']
  writeSharedSnapshot?: Runtime.SyncEngine['writeSharedSnapshot']
}>

/**
 * Wraps a snapshot-log transport as the Runtime.start SyncEngine.
 * Instant has no Model.
 */
export const fromTransport = (
  transport: SnapshotLogTransport,
  processor: string,
  links?: Runtime.SyncEngine['links'],
  options?: FromTransportOptions,
): Runtime.SyncEngine => {
  const writesSnapshot = options?.writesSnapshot ?? true
  return {
    processor,
    writesSnapshot,
    ...(links === undefined ? {} : { links }),
    ...(options?.localSnapshot === undefined
      ? {}
      : { localSnapshot: options.localSnapshot }),
    ...(options?.snapshotScope === undefined
      ? {}
      : { snapshotScope: options.snapshotScope }),
    ...(options?.watchAuthChanged === undefined
      ? {}
      : { watchAuthChanged: options.watchAuthChanged }),
    ...(options?.hasOwnRows === undefined
      ? {}
      : { hasOwnRows: options.hasOwnRows }),
    ...(options?.readSharedSnapshots === undefined
      ? {}
      : { readSharedSnapshots: options.readSharedSnapshots }),
    ...(options?.writeSharedSnapshot === undefined
      ? {}
      : { writeSharedSnapshot: options.writeSharedSnapshot }),
    read: () =>
      transport.read().pipe(
        Effect.map(state => ({
          snapshot: isBlankSnapshot(state.snapshot)
            ? undefined
            : state.snapshot,
          messages: state.messages.filter(message =>
            messageBelongsToInstantRoom(message.from, processor),
          ),
        })),
        Effect.mapError(error => toTransportError(error, 'Read')),
      ),
    ...Option.match(readSinceOf(transport, processor), {
      onNone: () => ({}),
      onSome: readSince => ({ readSince }),
    }),
    subscribe: enqueue =>
      Effect.gen(function* () {
        const ready = yield* Deferred.make<void>()
        const seenMessageIds = new Set<string>()
        yield* (transport.subscribeRecent ?? transport.subscribe).pipe(
          Stream.tap(() => Deferred.succeed(ready, undefined)),
          Stream.runForEach(state =>
            Effect.sync(() => {
              enqueue({
                _tag: 'Snapshot',
                row: isBlankSnapshot(state.snapshot)
                  ? undefined
                  : state.snapshot,
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
    write: write => {
      const snapshotEffect = writesSnapshot
        ? decodeSnapshot(write.snapshot)
        : Effect.succeed(emptyCountSnapshot)
      return snapshotEffect.pipe(
        Effect.flatMap(snapshot =>
          decodeMessage(
            write.message,
            options?.keepsClientFields === true,
          ).pipe(
            Effect.flatMap(message =>
              transport.write({ message, snapshot }).pipe(
                Effect.map(outcome => ({
                  link: linkOf(outcome),
                })),
                Effect.mapError(error =>
                  toTransportError(error, 'Write', write),
                ),
              ),
            ),
          ),
        ),
      )
    },
  }
}

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
