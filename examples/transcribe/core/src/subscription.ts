import { Effect, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { FailedObserveJobs, type Message, ObservedJobs } from './message.js'
import { type Model } from './model.js'
import { TranscribeStore } from './store.js'

/** Observes the Instant catalog, falling back through store snapshots. */
export const subscriptions = Subscription.make<
  Model,
  Message,
  TranscribeStore
>()(_entry => ({
  jobs: Subscription.persistent(
    Stream.unwrap(
      TranscribeStore.pipe(
        Effect.map(store =>
          store.observe.pipe(
            Stream.map(snapshot =>
              ObservedJobs.make({
                jobs: snapshot.jobs,
                source: snapshot.source,
              }),
            ),
            Stream.catch(error =>
              Stream.make(
                FailedObserveJobs.make({
                  reason: `${error.operation}: ${String(error.cause)}`,
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
}))
