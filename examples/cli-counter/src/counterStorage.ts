import { Context, Data, Effect, Option, Schema as S, Stream } from 'effect'

/** The durable Counter value shared by every host. */
export const StoredCounter = S.Struct({ count: S.Number })
export type StoredCounter = typeof StoredCounter.Type

/** A backend-independent failure from loading, saving, or observing a Counter. */
export class CounterStorageError extends Data.TaggedError(
  'CounterStorageError',
)<{
  readonly reason: string
}> {}

/** Backend-independent durable Counter operations. */
export class CounterStorage extends Context.Service<
  CounterStorage,
  Readonly<{
    load: Effect.Effect<Option.Option<StoredCounter>, CounterStorageError>
    save: (counter: StoredCounter) => Effect.Effect<void, CounterStorageError>
    changes: Stream.Stream<StoredCounter, CounterStorageError>
  }>
>()('cli-counter/CounterStorage') {}
