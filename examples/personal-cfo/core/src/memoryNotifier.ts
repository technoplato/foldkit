import { Console, Effect, Layer, Ref } from 'effect'

import { type AppNotification } from './domain.js'
import { Notifier } from './notifier.js'

/** Captured local deliveries for tests and hosts without a platform banner. */
export type DeliveredNotification = AppNotification

/** In-memory Notifier that records deliveries and prints a line. */
export const layerMemoryNotifier = Layer.effect(
  Notifier,
  Effect.gen(function* () {
    const delivered = yield* Ref.make<ReadonlyArray<DeliveredNotification>>([])
    return {
      deliverLocal: notification =>
        Effect.gen(function* () {
          yield* Ref.update(delivered, list => [...list, notification])
          yield* Console.log(
            `notify  ${notification.channel}  ${notification.title}  ${notification.body}`,
          )
        }),
    }
  }),
)
