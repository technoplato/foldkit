import { Effect, Layer, Ref, Stream } from 'effect'

import {
  LeftoverPeer,
  LeftoverPresence,
  LeftoverPresenceError,
  type LeftoverPresenceJoin,
  type LeftoverPresenceService,
  quorumFromPeers,
} from './domain.js'

type RoomState = Readonly<{
  peers: ReadonlyArray<LeftoverPeer>
}>

/** In-memory leftover rooms for tests. Not Instant. */
export const makeMemoryLeftoverPresence = (): LeftoverPresenceService => {
  const rooms = Ref.makeUnsafe(new Map<string, RoomState>())
  return {
    joinLeftoverRoom: (join: LeftoverPresenceJoin) =>
      Ref.update(rooms, current => {
        const next = new Map(current)
        const existing = next.get(join.leftoverId)?.peers ?? []
        const peer = LeftoverPeer.make({
          agentId: join.agentId,
          leftoverId: join.leftoverId,
          origin: join.origin,
          peerId: join.agentId,
          role: join.role,
        })
        next.set(join.leftoverId, {
          peers: [...existing.filter(p => p.peerId !== peer.peerId), peer],
        })
        return next
      }).pipe(Effect.asVoid),
    leaveLeftoverRoom: leftoverId =>
      Ref.update(rooms, current => {
        const next = new Map(current)
        next.delete(leftoverId)
        return next
      }).pipe(Effect.asVoid),
    observeLeftoverRoom: leftoverId =>
      Stream.fromEffect(
        Ref.get(rooms).pipe(
          Effect.map(current => current.get(leftoverId)?.peers ?? []),
        ),
      ),
    quorum: (leftoverId, required) =>
      Ref.get(rooms).pipe(
        Effect.map(current =>
          quorumFromPeers(
            leftoverId,
            current.get(leftoverId)?.peers ?? [],
            required,
          ),
        ),
        Effect.catch(error =>
          Effect.fail(
            new LeftoverPresenceError({ cause: error, operation: 'Quorum' }),
          ),
        ),
      ),
  }
}

/** Layer of in-memory leftover presence. */
export const MemoryLeftoverPresenceLive = Layer.sync(LeftoverPresence, () =>
  makeMemoryLeftoverPresence(),
)
