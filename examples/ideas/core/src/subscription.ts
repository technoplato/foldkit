import { Effect, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { FailedObserveIdeas, type Message, ObservedIdeas } from './message.js'
import { type Model } from './model.js'
import { IdeasStore } from './store.js'

/** Observes the Instant catalog, falling back through store snapshots. */
export const subscriptions = Subscription.make<Model, Message, IdeasStore>()(
  _entry => ({
    ideas: Subscription.persistent(
      Stream.unwrap(
        IdeasStore.pipe(
          Effect.map(store =>
            store.observe.pipe(
              Stream.map(snapshot =>
                ObservedIdeas.make({
                  ideas: snapshot.ideas,
                  source: snapshot.source,
                }),
              ),
              Stream.catch(error =>
                Stream.make(
                  FailedObserveIdeas.make({
                    reason: `${error.operation}: ${String(error.cause)}`,
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  }),
)
