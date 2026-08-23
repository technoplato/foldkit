import { Effect, Layer, Queue, Ref, Stream } from 'effect'

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

type Listener = (peers: ReadonlyArray<LeftoverPeer>) => void

/** In-memory leftover rooms for tests. Not Instant. */
export const makeMemoryLeftoverPresence = (): LeftoverPresenceService => {
  const rooms = Ref.makeUnsafe(new Map<string, RoomState>())
  const listeners = new Map<string, Set<Listener>>()

  const peersOf = (
    current: Map<string, RoomState>,
    leftoverId: string,
  ): ReadonlyArray<LeftoverPeer> => current.get(leftoverId)?.peers ?? []

  const notify = (leftoverId: string, peers: ReadonlyArray<LeftoverPeer>) => {
    const set = listeners.get(leftoverId)
    if (set === undefined) {
      return
    }
    for (const listener of set) {
      listener(peers)
    }
  }

  return {
    joinLeftoverRoom: (join: LeftoverPresenceJoin) =>
      Ref.updateAndGet(rooms, current => {
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
          peers: [
            ...existing.filter(present => present.peerId !== peer.peerId),
            peer,
          ],
        })
        return next
      }).pipe(
        Effect.tap(current =>
          Effect.sync(() =>
            notify(join.leftoverId, peersOf(current, join.leftoverId)),
          ),
        ),
        Effect.asVoid,
      ),
    leaveLeftoverRoom: leftoverId =>
      Ref.update(rooms, current => {
        const next = new Map(current)
        next.delete(leftoverId)
        return next
      }).pipe(
        Effect.tap(() => Effect.sync(() => notify(leftoverId, []))),
        Effect.asVoid,
      ),
    observeLeftoverRoom: leftoverId =>
      Stream.callback<ReadonlyArray<LeftoverPeer>, LeftoverPresenceError>(
        queue =>
          Effect.acquireRelease(
            Ref.get(rooms).pipe(
              Effect.map(current => {
                const listener: Listener = peers => {
                  Queue.offerUnsafe(queue, peers)
                }
                const set = listeners.get(leftoverId) ?? new Set<Listener>()
                set.add(listener)
                listeners.set(leftoverId, set)
                listener(peersOf(current, leftoverId))
                return () => {
                  const currentListeners = listeners.get(leftoverId)
                  if (currentListeners === undefined) {
                    return
                  }
                  currentListeners.delete(listener)
                  if (currentListeners.size === 0) {
                    listeners.delete(leftoverId)
                  }
                }
              }),
            ),
            unsubscribe => Effect.sync(unsubscribe),
          ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    quorum: (leftoverId, required) =>
      Ref.get(rooms).pipe(
        Effect.map(current =>
          quorumFromPeers(leftoverId, peersOf(current, leftoverId), required),
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
