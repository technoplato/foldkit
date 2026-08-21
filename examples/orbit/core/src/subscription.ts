import { Effect, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { FailedObserveSnap, type Message, ObservedSnap } from './message.js'
import { type Model } from './model.js'
import { OrbitStore } from './store.js'

/** Observes the Instant snap, falling back through store snapshots. */
export const subscriptions = Subscription.make<Model, Message, OrbitStore>()(
  _entry => ({
    snap: Subscription.persistent(
      Stream.unwrap(
        OrbitStore.pipe(
          Effect.map(store =>
            store.observe.pipe(
              Stream.map(snapshot =>
                ObservedSnap.make({
                  modelJson: snapshot.modelJson,
                  seq: snapshot.seq,
                  source: snapshot.source,
                }),
              ),
              Stream.catch(error =>
                Stream.make(
                  FailedObserveSnap.make({
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
