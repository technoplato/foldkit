import { Effect, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { FailedObserveGraph, type Message, ObservedGraph } from './message.js'
import { type Model } from './model.js'
import type { AdvocacyResources } from './resources.js'
import { AdvocacyStore } from './store.js'

/** Observes the Instant meeting graph, falling back through store snapshots. */
export const subscriptions = Subscription.make<
  Model,
  Message,
  AdvocacyResources
>()(_entry => ({
  graph: Subscription.persistent(
    Stream.unwrap(
      AdvocacyStore.pipe(
        Effect.map(store =>
          store.observe.pipe(
            Stream.map(snapshot =>
              ObservedGraph({
                graph: snapshot.graph,
                source: snapshot.source,
              }),
            ),
            Stream.catch(error =>
              Stream.make(
                FailedObserveGraph({
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
