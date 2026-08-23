import { Cause, Effect, Layer, Option, Queue, Stream } from 'effect'

import type { InstantToolsDatabase } from '../instant/instant.js'
import {
  LeftoverPeer,
  LeftoverPresence,
  LeftoverPresenceError,
  type LeftoverPresenceJoin,
  type LeftoverPresenceService,
  quorumFromPeers,
} from './domain.js'

type LeftoverPresenceShape = Readonly<{
  agentId: string
  leftoverId: string
  origin: string
  role: string
}>

type LeftoverPresenceSlice = Readonly<{
  error?: string
  peers: Record<string, Partial<LeftoverPresenceShape> & { peerId?: string }>
  user?: Partial<LeftoverPresenceShape> & { peerId?: string }
}>

const peerFromSlice = (
  leftoverId: string,
  peerId: string,
  data: Partial<LeftoverPresenceShape>,
): LeftoverPeer =>
  LeftoverPeer.make({
    agentId: data.agentId ?? peerId,
    leftoverId: data.leftoverId ?? leftoverId,
    origin: data.origin ?? '',
    peerId,
    role: data.role ?? '',
  })

const peersFromSlice = (
  leftoverId: string,
  slice: LeftoverPresenceSlice,
): ReadonlyArray<LeftoverPeer> => {
  const peers: Array<LeftoverPeer> = []
  for (const [peerId, data] of Object.entries(slice.peers)) {
    peers.push(peerFromSlice(leftoverId, data.peerId ?? peerId, data))
  }
  if (slice.user !== undefined) {
    peers.push(
      peerFromSlice(leftoverId, slice.user.peerId ?? 'self', slice.user),
    )
  }
  return peers
}

/** Instant leftover rooms via core joinRoom / subscribePresence / publishPresence. */
export const makeInstantLeftoverPresence = (
  database: InstantToolsDatabase,
): LeftoverPresenceService => {
  const rooms = new Map<string, ReturnType<InstantToolsDatabase['joinRoom']>>()
  const roomFor = (leftoverId: string) => {
    const existing = rooms.get(leftoverId)
    if (existing !== undefined) {
      return existing
    }
    const room = database.joinRoom('leftover', leftoverId)
    rooms.set(leftoverId, room)
    return room
  }
  const observe = (leftoverId: string) =>
    Stream.concat(
      Stream.succeed<ReadonlyArray<LeftoverPeer>>([]),
      Stream.callback<ReadonlyArray<LeftoverPeer>, LeftoverPresenceError>(
        queue =>
          Effect.acquireRelease(
            Effect.try({
              try: () => {
                const room = roomFor(leftoverId)
                return room.subscribePresence(
                  {},
                  (slice: LeftoverPresenceSlice) => {
                    if (slice.error !== undefined) {
                      Queue.failCauseUnsafe(
                        queue,
                        Cause.fail(
                          new LeftoverPresenceError({
                            cause: slice.error,
                            operation: 'Observe',
                          }),
                        ),
                      )
                      return
                    }
                    Queue.offerUnsafe(queue, peersFromSlice(leftoverId, slice))
                  },
                )
              },
              catch: cause =>
                new LeftoverPresenceError({ cause, operation: 'Observe' }),
            }),
            unsubscribe => Effect.sync(unsubscribe),
          ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    )
  return {
    joinLeftoverRoom: (join: LeftoverPresenceJoin) =>
      Effect.try({
        try: () => {
          roomFor(join.leftoverId).publishPresence({
            agentId: join.agentId,
            leftoverId: join.leftoverId,
            origin: join.origin,
            role: join.role,
          })
        },
        catch: cause => new LeftoverPresenceError({ cause, operation: 'Join' }),
      }),
    leaveLeftoverRoom: leftoverId =>
      Effect.try({
        try: () => {
          rooms.get(leftoverId)?.leaveRoom()
          rooms.delete(leftoverId)
        },
        catch: cause =>
          new LeftoverPresenceError({ cause, operation: 'Leave' }),
      }),
    observeLeftoverRoom: observe,
    quorum: (leftoverId, required) =>
      Stream.runHead(Stream.take(observe(leftoverId), 1)).pipe(
        Effect.map(option =>
          quorumFromPeers(
            leftoverId,
            Option.getOrElse(option, () => []),
            required,
          ),
        ),
        Effect.catch(error =>
          Effect.fail(
            error instanceof LeftoverPresenceError
              ? error
              : new LeftoverPresenceError({
                  cause: error,
                  operation: 'Quorum',
                }),
          ),
        ),
      ),
  }
}

/** Instant leftover presence layer. */
export const makeInstantLeftoverPresenceLayer = (
  database: InstantToolsDatabase,
) => Layer.succeed(LeftoverPresence, makeInstantLeftoverPresence(database))
