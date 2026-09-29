import { Effect, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import type { Message } from './message.js'
import { type Model, isHoldingUnsavedAudio, isReadingEvents } from './model.js'
import {
  CaptureEnvironment,
  CaptureSession,
  type CaptureSessionService,
} from './session.js'

/**
 * The microphone session's events while it records and while the
 * transcriber finishes, and a guard that asks before the page closes while
 * recorded audio is not saved yet.
 */
export const subscriptions = Subscription.make<
  Model,
  Message,
  CaptureSessionService | CaptureEnvironment
>()(entry => ({
  sessionEvents: entry(
    { isReadingEvents: S.Boolean },
    {
      modelToDependencies: model => ({
        isReadingEvents: isReadingEvents(model),
      }),
      dependenciesToStream: ({ isReadingEvents }) =>
        Stream.when(
          Stream.unwrap(
            CaptureSession.get.pipe(
              Effect.map(session => session.events),
              Effect.catchTag('ResourceNotAvailable', () =>
                Effect.succeed(Stream.empty),
              ),
            ),
          ),
          Effect.sync(() => isReadingEvents),
        ),
    },
  ),
  pageCloseGuard: entry(
    { isGuarding: S.Boolean },
    {
      modelToDependencies: model => ({
        isGuarding: isHoldingUnsavedAudio(model),
      }),
      dependenciesToStream: ({ isGuarding }) =>
        Stream.when(
          Stream.unwrap(
            CaptureEnvironment.pipe(
              Effect.map(environment => environment.guardPageClose),
            ),
          ),
          Effect.sync(() => isGuarding),
        ),
    },
  ),
}))
