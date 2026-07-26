import { Effect, Match as M, Number, Option, Schema as S, Stream } from 'effect'
import { Command, Subscription } from 'foldkit'
import { m } from 'foldkit/message'
import { ts } from 'foldkit/schema'

import { CounterStorage, StoredCounter } from './counterStorage.js'

// MODEL

export const Loading = ts('Loading')
export const Ready = ts('Ready', { count: S.Number })
export const Saving = ts('Saving', { count: S.Number })

export const Model = S.Union([Loading, Ready, Saving])
export type Model = typeof Model.Type

// MESSAGE

export const LoadedCounter = m('LoadedCounter', {
  maybeCounter: S.Option(StoredCounter),
})
export const FailedLoadCounter = m('FailedLoadCounter', { reason: S.String })
export const RequestedIncrement = m('RequestedIncrement')
export const RequestedDecrement = m('RequestedDecrement')
export const RequestedReset = m('RequestedReset')
export const CompletedPersistCounter = m('CompletedPersistCounter', {
  count: S.Number,
})
export const FailedPersistCounter = m('FailedPersistCounter', {
  reason: S.String,
})
export const ObservedStoredCounter = m('ObservedStoredCounter', {
  counter: StoredCounter,
})
export const FailedObserveStoredCounter = m('FailedObserveStoredCounter', {
  reason: S.String,
})

export const Message = S.Union([
  LoadedCounter,
  FailedLoadCounter,
  RequestedIncrement,
  RequestedDecrement,
  RequestedReset,
  CompletedPersistCounter,
  FailedPersistCounter,
  ObservedStoredCounter,
  FailedObserveStoredCounter,
])
export type Message = typeof Message.Type

// COMMAND

export const LoadCounter = Command.define(
  'LoadCounter',
  LoadedCounter,
  FailedLoadCounter,
)(
  Effect.gen(function* () {
    const storage = yield* CounterStorage
    const maybeCounter = yield* storage.load
    return LoadedCounter({ maybeCounter })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedLoadCounter({ reason: error.reason })),
    ),
  ),
)

export const PersistCounter = Command.define(
  'PersistCounter',
  { count: S.Number },
  CompletedPersistCounter,
  FailedPersistCounter,
)(({ count }) =>
  Effect.gen(function* () {
    const storage = yield* CounterStorage
    yield* storage.save(StoredCounter.make({ count }))
    return CompletedPersistCounter({ count })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedPersistCounter({ reason: error.reason })),
    ),
  ),
)

const commandsForModel = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, CounterStorage>> =>
  M.value(model).pipe(
    M.withReturnType<
      ReadonlyArray<Command.Command<Message, never, CounterStorage>>
    >(),
    M.tagsExhaustive({
      Loading: () => [LoadCounter()],
      Ready: () => [],
      Saving: ({ count }) => [PersistCounter({ count })],
    }),
  )

// INIT

/** Creates init for a particular portable Counter state. */
export const initFromModel =
  (model: Model) =>
  (): readonly [
    Model,
    ReadonlyArray<Command.Command<Message, never, CounterStorage>>,
  ] => [model, commandsForModel(model)]

/** Initializes the ordinary persisted Counter flow in Loading mode. */
export const init = initFromModel(Loading())

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CounterStorage>>,
]

const updateCount = (
  model: Model,
  transform: (count: number) => number,
): UpdateReturn =>
  M.value(model).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      Loading: () => [model, []],
      Ready: ({ count }) => {
        const nextCount = transform(count)
        return [
          Saving({ count: nextCount }),
          [PersistCounter({ count: nextCount })],
        ]
      },
      Saving: ({ count }) => {
        const nextCount = transform(count)
        return [
          Saving({ count: nextCount }),
          [PersistCounter({ count: nextCount })],
        ]
      },
    }),
  )

/** Applies one Counter Message and returns the next Model and Commands. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      LoadedCounter: ({ maybeCounter }) => [
        Ready({
          count: Option.match(maybeCounter, {
            onNone: () => 0,
            onSome: counter => counter.count,
          }),
        }),
        [],
      ],
      FailedLoadCounter: () => [model, []],
      RequestedIncrement: () => updateCount(model, Number.increment),
      RequestedDecrement: () => updateCount(model, Number.decrement),
      RequestedReset: () => updateCount(model, () => 0),
      CompletedPersistCounter: ({ count }) => [Ready({ count }), []],
      FailedPersistCounter: () => [model, []],
      ObservedStoredCounter: ({ counter }) => [
        Ready({ count: counter.count }),
        [],
      ],
      FailedObserveStoredCounter: () => [model, []],
    }),
  )

const storedCounterChanges = Stream.unwrap(
  CounterStorage.pipe(
    Effect.map(storage =>
      storage.changes.pipe(
        Stream.map(counter => ObservedStoredCounter({ counter })),
        Stream.catch(error =>
          Stream.make(FailedObserveStoredCounter({ reason: error.reason })),
        ),
      ),
    ),
  ),
)

/** Observes durable Counter changes for the lifetime of the Program. */
export const subscriptions = Subscription.make<
  Model,
  Message,
  CounterStorage
>()(_entry => ({
  storedCounterChanges: Subscription.persistent(storedCounterChanges),
}))

/** Builds the renderer-free Counter Program from a portable starting Model. */
export const makeCounterProgram = (model: Model) => ({
  Model,
  Message,
  init: initFromModel(model),
  update,
  subscriptions,
})
