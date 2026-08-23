import { Context, Data, Effect, Schema as S, Stream } from 'effect'

/** One peer currently in a leftover room. */
export const LeftoverPeer = S.Struct({
  agentId: S.String,
  leftoverId: S.String,
  origin: S.String,
  peerId: S.String,
  role: S.String,
})
export type LeftoverPeer = typeof LeftoverPeer.Type

/** Who is in a leftover room and whether a required count is present. */
export const LeftoverQuorum = S.Struct({
  hasQuorum: S.Boolean,
  leftoverId: S.String,
  present: S.Array(LeftoverPeer),
  required: S.Int,
})
export type LeftoverQuorum = typeof LeftoverQuorum.Type

/** Identity published when joining a leftover room. */
export const LeftoverPresenceJoin = S.Struct({
  agentId: S.String,
  leftoverId: S.String,
  origin: S.String,
  role: S.String,
})
export type LeftoverPresenceJoin = typeof LeftoverPresenceJoin.Type

/** Presence transport failed. */
export class LeftoverPresenceError extends Data.TaggedError(
  'LeftoverPresenceError',
)<{
  readonly cause: unknown
  readonly operation: 'Join' | 'Leave' | 'Observe' | 'Quorum'
}> {}

/** Transport-neutral leftover room presence. */
export type LeftoverPresenceService = Readonly<{
  joinLeftoverRoom: (
    join: LeftoverPresenceJoin,
  ) => Effect.Effect<void, LeftoverPresenceError>
  leaveLeftoverRoom: (
    leftoverId: string,
  ) => Effect.Effect<void, LeftoverPresenceError>
  observeLeftoverRoom: (
    leftoverId: string,
  ) => Stream.Stream<ReadonlyArray<LeftoverPeer>, LeftoverPresenceError>
  quorum: (
    leftoverId: string,
    required: number,
  ) => Effect.Effect<LeftoverQuorum, LeftoverPresenceError>
}>

/** Injected leftover presence whose implementation is selected by the host. */
export class LeftoverPresence extends Context.Service<
  LeftoverPresence,
  LeftoverPresenceService
>()('@foldkit/instant-tools/LeftoverPresence') {}

/** True when at least `required` peers are present. Does not call done. */
export const quorumFromPeers = (
  leftoverId: string,
  present: ReadonlyArray<LeftoverPeer>,
  required: number,
): LeftoverQuorum =>
  LeftoverQuorum.make({
    hasQuorum: present.length >= required,
    leftoverId,
    present,
    required,
  })
