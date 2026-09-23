import { Match as M, Option, Schema as S } from 'effect'
import { type Processor, type Runtime, Synchronization } from 'foldkit'

import type { InstantSnapshotLogDatabase } from '@foldkit/instant/snapshot-log'

import { type App } from './app.js'

/** A live synced Counter any Client can read, watch, and send to. */
export type CounterHandle = Runtime.SyncedHandle<typeof App>

/**
 * Which tape a Counter Processor runs on. Memory keeps the count in this
 * process; Instant shares it with every other Processor.
 */
export const CounterTape = S.Literals(['Instant', 'Memory'])
/** Which tape a Counter Processor runs on. */
export type CounterTape = typeof CounterTape.Type

/**
 * How one Counter Processor starts. `instance` must be unique per run so
 * two tabs of the same host never share navigation (Q107). A native Client
 * passes the Instant `database` it opened with `@instantdb/react-native`.
 *
 * @example
 * ```typescript
 * startCounter({
 *   host: Processor.Host.React(),
 *   instance: newProcessorInstance(),
 *   tape: 'Instant',
 * })
 * ```
 */
export type StartCounterConfig = Readonly<{
  host: Processor.Host.Host
  instance: string
  tape?: CounterTape
  policy?: Synchronization.SessionPolicy
  database?: InstantSnapshotLogDatabase
}>

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)

/**
 * The synchronization words a Client accepts from a URL or argv. `mirror`
 * shares the action menu with every device; `shared-domain` shares only the
 * count.
 */
export const SyncModeWord = S.Literals(['mirror', 'shared-domain'])
/** The synchronization words a Client accepts from a URL or argv. */
export type SyncModeWord = typeof SyncModeWord.Type

/**
 * The session policy for one synchronization word. None for anything else,
 * so the caller keeps the default instead of guessing.
 *
 * @example
 * ```typescript
 * syncPolicyOf('shared-domain') // Some(SharedDomain policy)
 * syncPolicyOf('everything') // None
 * ```
 */
export const syncPolicyOf = (
  word: string,
): Option.Option<Synchronization.SessionPolicy> =>
  Option.map(S.decodeUnknownOption(SyncModeWord)(word), modeWord =>
    Synchronization.SessionPolicy.make({
      generation: 0,
      mode: M.value(modeWord).pipe(
        M.withReturnType<Synchronization.Mode>(),
        M.when('mirror', () => Synchronization.Mirror.make({})),
        M.when('shared-domain', () => Synchronization.SharedDomain.make({})),
        M.exhaustive,
      ),
    }),
  )
