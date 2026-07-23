import { Effect, Layer, Option, Stream } from 'effect'
import { Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  CompletedPersistCounter,
  Loading,
  ObservedStoredCounter,
  Ready,
  RequestedIncrement,
  Saving,
  makeCounterProgram,
  update,
} from './counter.js'
import { CounterStorage, StoredCounter } from './counterStorage.js'

describe('Counter Program', () => {
  it('moves immediately to Saving and emits one persistence Command', () => {
    const [model, commands] = update(Ready({ count: 1 }), RequestedIncrement())

    expect(model).toStrictEqual(Saving({ count: 2 }))
    expect(commands.map(command => command.name)).toStrictEqual([
      'PersistCounter',
    ])
    expect(commands.map(command => command.args)).toStrictEqual([{ count: 2 }])
  })

  it('returns to Ready when persistence completes', () => {
    const [model, commands] = update(
      Saving({ count: 2 }),
      CompletedPersistCounter({ count: 2 }),
    )

    expect(model).toStrictEqual(Ready({ count: 2 }))
    expect(commands).toStrictEqual([])
  })

  it('accepts outside storage changes without writing them back', () => {
    const [model, commands] = update(
      Ready({ count: 1 }),
      ObservedStoredCounter({ counter: StoredCounter.make({ count: 8 }) }),
    )

    expect(model).toStrictEqual(Ready({ count: 8 }))
    expect(commands).toStrictEqual([])
  })

  it('waits for the complete persistence chain before run returns', async () => {
    const savedCounts = new Array<number>()
    const storage = CounterStorage.of({
      load: Effect.succeed(Option.some(StoredCounter.make({ count: 4 }))),
      save: counter =>
        Effect.sync(() => {
          savedCounts.push(counter.count)
        }),
      changes: Stream.never,
    })

    const finalModel = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeHostRuntime({
            ...makeCounterProgram(Loading()),
            resources: Layer.succeed(CounterStorage, storage),
          })

          expect(yield* runtime.initialization).toStrictEqual(
            Ready({ count: 4 }),
          )
          const result = yield* runtime.run(RequestedIncrement())
          yield* runtime.shutdown
          return result
        }),
      ),
    )

    expect(finalModel).toStrictEqual(Ready({ count: 5 }))
    expect(savedCounts).toStrictEqual([5])
  })
})
