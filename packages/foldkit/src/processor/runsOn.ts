import { Match as M, Option, Schema as S } from 'effect'

import { ts } from '../schema/index.js'
import type { Host } from './host.js'

/**
 * Where a Subscription or a ManagedResource runs, said once on its entry
 * as `runsOn`. Most work runs on every Processor that holds the Program:
 * a clock, a listener, a socket to the sync engine. Some must run in one
 * place for an owner, such as a claim taken when a copy is approved on a
 * phone, or a call to a vendor with the secrets. That work says
 * `RunsOn.serverOnly`, and the runtime starts it only on a Processor
 * whose Host is `Server`.
 *
 * Nothing here makes two Server Processors one: an owner runs at most
 * one by how it is deployed, and work that must not happen twice is
 * still claimed behind a port before it acts.
 */

/** Runs on every Processor that holds the Program. The default. */
export const Everywhere = ts('Everywhere')
/** Runs on every Processor that holds the Program. The default. */
export type Everywhere = typeof Everywhere.Type

/** Runs only on a Processor whose Host is `Server`. */
export const ServerOnly = ts('ServerOnly')
/** Runs only on a Processor whose Host is `Server`. */
export type ServerOnly = typeof ServerOnly.Type

/** Where an entry runs. Pass `RunsOn.serverOnly`, not `'ServerOnly'`. */
export const RunsOn = S.Union([Everywhere, ServerOnly])
/** Where an entry runs. Pass `RunsOn.serverOnly`, not `'ServerOnly'`. */
export type RunsOn = typeof RunsOn.Type

/** Runs on every Processor that holds the Program. */
export const everywhere: RunsOn = Everywhere()

/**
 * Runs only on the Server Processor.
 *
 * @example
 * ```typescript
 * Subscription.make<Model, Message>()(entry => ({
 *   approvedUnclaimed: entry(
 *     { waiting: S.Array(CopyId) },
 *     {
 *       runsOn: Processor.RunsOn.serverOnly,
 *       modelToDependencies: model => ({ waiting: approvedUnclaimed(model) }),
 *       dependenciesToStream: ({ waiting }) =>
 *         Stream.map(Stream.fromIterable(waiting), copy => NoticedApprovedCopy({ copy })),
 *     },
 *   ),
 * }))
 * ```
 */
export const serverOnly: RunsOn = ServerOnly()

/**
 * What an entry carries when it says where it runs. An entry that says
 * nothing runs everywhere.
 */
export type Placed = Readonly<{ runsOn?: RunsOn }>

/**
 * True when work that says `runsOn` runs on a Processor of this Host.
 * Work that says nothing, or `everywhere`, runs on any Host and where
 * the Host is not known. Server-only work runs on `Server` alone: not
 * on a phone, not on `Headless`, so a test on `Runtime.Memory` never
 * starts vendor work, and not where the Host is not known.
 *
 * @example
 * ```typescript
 * runsHere(RunsOn.serverOnly, Option.some(Host.Server())) // true
 * runsHere(RunsOn.serverOnly, Option.some(Host.ExpoIos())) // false
 * runsHere(RunsOn.serverOnly, Option.none()) // false
 * runsHere(undefined, Option.none()) // true
 * ```
 */
export const runsHere = (
  runsOn: RunsOn | undefined,
  maybeHost: Option.Option<Host>,
): boolean => {
  if (runsOn === undefined) {
    return true
  } else {
    return M.value(runsOn).pipe(
      M.withReturnType<boolean>(),
      M.tagsExhaustive({
        Everywhere: () => true,
        ServerOnly: () =>
          Option.exists(maybeHost, host => host._tag === 'Server'),
      }),
    )
  }
}
