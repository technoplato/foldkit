import {
  Array,
  Cause,
  Data,
  Effect,
  Queue,
  Schema as S,
  Scope,
  Stream,
} from 'effect'

import {
  InstantProcessorActivity,
  type InstantProcessorActivity as InstantProcessorActivityType,
  InstantProcessorPresence,
  type InstantProcessorPresence as InstantProcessorPresenceType,
  type InstantProgramDatabase,
} from '../schema/index.js'

/** A transient Processor room operation failed. */
export class ProcessorRoomError extends Data.TaggedError('ProcessorRoomError')<{
  readonly cause: unknown
  readonly operation: 'ObservePresence' | 'PublishActivity' | 'PublishPresence'
}> {}

/** A joined Instant room used only for Processor routing and liveness. */
export type ProcessorRoomService = Readonly<{
  observePresence: Stream.Stream<
    ReadonlyArray<InstantProcessorPresenceType>,
    ProcessorRoomError
  >
  publishActivity: (
    activity: InstantProcessorActivityType,
  ) => Effect.Effect<void, ProcessorRoomError>
  publishPresence: (
    presence: InstantProcessorPresenceType,
  ) => Effect.Effect<void, ProcessorRoomError>
}>

/** Decodes valid transient peers without letting one malformed peer hide the room. */
export const decodeProcessorRoomParticipants = (
  participants: ReadonlyArray<unknown>,
): ReadonlyArray<InstantProcessorPresenceType> =>
  Array.getSomes(
    Array.map(participants, participant =>
      S.decodeUnknownOption(InstantProcessorPresence)(participant),
    ),
  )

/** Joins a high-entropy session room without making its presence authoritative. */
export const makeProcessorRoom = (
  database: InstantProgramDatabase,
  roomId: string,
  initialPresence: InstantProcessorPresenceType,
): Effect.Effect<ProcessorRoomService, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() =>
      database.joinRoom('foldkitProcessors', roomId, {
        initialPresence,
      }),
    ),
    room => Effect.sync(room.leaveRoom),
  ).pipe(
    Effect.map(room => ({
      observePresence: Stream.callback<
        ReadonlyArray<InstantProcessorPresenceType>,
        ProcessorRoomError
      >(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            room.subscribePresence({}, response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new ProcessorRoomError({
                      cause: response.error,
                      operation: 'ObservePresence',
                    }),
                  ),
                )
              } else {
                const peers = Object.values(response.peers)
                const participants =
                  response.user === undefined
                    ? peers
                    : [response.user, ...peers]
                Queue.offerUnsafe(
                  queue,
                  decodeProcessorRoomParticipants(participants),
                )
              }
            }),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        ),
      ),
      publishActivity: activity =>
        Effect.try({
          try: () =>
            room.publishTopic(
              'processorActivity',
              S.decodeUnknownSync(InstantProcessorActivity)(activity),
            ),
          catch: cause =>
            new ProcessorRoomError({
              cause,
              operation: 'PublishActivity',
            }),
        }),
      publishPresence: presence =>
        Effect.try({
          try: () =>
            room.publishPresence(
              S.decodeUnknownSync(InstantProcessorPresence)(presence),
            ),
          catch: cause =>
            new ProcessorRoomError({
              cause,
              operation: 'PublishPresence',
            }),
        }),
    })),
  )
