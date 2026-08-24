import { Array, Context, Data, Effect, Schema as S, Stream } from 'effect'

/** One peer currently in a leftover room. */
export const LeftoverPeer = S.Struct({
  agentId: S.String,
  leftoverId: S.String,
  origin: S.String,
  peerId: S.String,
  role: S.String,
})
export type LeftoverPeer = typeof LeftoverPeer.Type

/** Peers required before leftover quorum is present. Does not call done. */
export const leftoverRoomRequired = 1

/** Required peer count is present. */
export const Present = S.TaggedStruct('Present', {
  leftoverId: S.String,
  present: S.NonEmptyArray(LeftoverPeer),
  required: S.Int,
})
/** Required peer count is missing. */
export const Missing = S.TaggedStruct('Missing', {
  leftoverId: S.String,
  present: S.Array(LeftoverPeer),
  required: S.Int,
})
/** Who is in a leftover room and whether the required count is present. */
export const LeftoverQuorum = S.Union([Present, Missing])
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

/** Present when at least `required` peers are in the leftover room. Does not call done. */
export const quorumFromPeers = (
  leftoverId: string,
  present: ReadonlyArray<LeftoverPeer>,
  required: number,
): LeftoverQuorum => {
  if (required >= leftoverRoomRequired && present.length >= required) {
    return Array.match(present, {
      onEmpty: () => Missing.make({ leftoverId, present, required }),
      onNonEmpty: items =>
        Present.make({ leftoverId, present: items, required }),
    })
  }
  return Missing.make({ leftoverId, present, required })
}
