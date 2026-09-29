import { Duration, Effect, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { type Message, TickedAccountRecheck } from './message.js'
import { type Model, isRechecking } from './model.js'

/** How often the page checks again while it waits for the iPhone to sign in. */
export const ACCOUNT_RECHECK_INTERVAL = Duration.seconds(5)

/**
 * While Scribe has no account for the Access email, or a check failed, the
 * page checks again on a timer, so it signs in within seconds of the iPhone.
 */
export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  recheck: entry(
    { isRechecking: S.Boolean },
    {
      modelToDependencies: model => ({ isRechecking: isRechecking(model) }),
      dependenciesToStream: ({ isRechecking }) =>
        Stream.when(
          Stream.tick(ACCOUNT_RECHECK_INTERVAL).pipe(
            Stream.drop(1),
            Stream.map(() => TickedAccountRecheck()),
          ),
          Effect.sync(() => isRechecking),
        ),
    },
  ),
}))
