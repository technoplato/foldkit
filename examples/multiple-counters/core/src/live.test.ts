import { Duration, Effect, Equal, Option } from 'effect'
import { Interaction, Navigation, Processor, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'

import { startCountersOn } from './live.js'
import { type CountersHandle } from './startConfig.js'
import { SyncedCounters } from './synced.js'

const started: Array<CountersHandle> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(handle => handle.stop()))
})

const settleAttempts = 200

const eventually = async <A>(read: () => A, expected: A): Promise<void> => {
  for (
    let attempt = 0;
    attempt < settleAttempts && !Equal.equals(read(), expected);
    attempt += 1
  ) {
    await Effect.runPromise(Effect.sleep(Duration.millis(1)))
  }
  expect(read()).toEqual(expected)
}

const startOn = async (
  store: Runtime.MemoryStore,
  host: Processor.Host.Host,
) => {
  const handle = startCountersOn(
    Runtime.Memory({ processor: Processor.Host.print(host), store }),
    host,
  )
  started.push(handle)
  const bound = Interaction.bind(SyncedCounters, handle)
  await Interaction.whenSettled(bound, 2_000)
  return bound
}

type Bound = Awaited<ReturnType<typeof startOn>>

const countsOf = (bound: Bound): ReadonlyArray<readonly [number, number]> => {
  const model = bound.readModel()
  return model._tag === 'Ready'
    ? model.counters.map((row): readonly [number, number] => [
        row.counterId,
        row.counter.count,
      ])
    : []
}

const uriOf = (bound: Bound): string =>
  Option.getOrElse(
    Option.map(bound.navigation(), plan => plan.uri),
    () => 'no plan',
  )

describe('Multiple Counters on one tape', () => {
  it('shows every count change and new counter on every Processor', async () => {
    const store = Runtime.makeMemoryStore()
    const phone = await startOn(store, Processor.Host.ExpoIos())
    const laptop = await startOn(store, Processor.Host.React())
    phone.press('AddCounter')
    phone.press('Increment:2')
    await eventually(
      () => countsOf(laptop),
      [
        [1, 0],
        [2, 1],
      ],
    )
  })

  it('closes another device’s page for a counter deleted here', async () => {
    const store = Runtime.makeMemoryStore()
    const phone = await startOn(store, Processor.Host.ExpoIos())
    const laptop = await startOn(store, Processor.Host.React())
    phone.press('KeepNavigationLocal')
    await eventually(() => {
      const model = laptop.readModel()
      return model._tag === 'Ready' ? model.session.mode : 'Starting'
    }, 'SharedDomain')
    laptop.press('OpenCounter:1')
    expect(uriOf(laptop)).toBe('/counters/1')
    phone.press('DeleteCounter:1')
    phone.press('ConfirmDeleteCounter')
    await eventually(() => uriOf(laptop), '/counters')
    expect(countsOf(laptop)).toEqual([])
  })

  it('names its window by the screen and the Host', async () => {
    const laptop = await startOn(
      Runtime.makeMemoryStore(),
      Processor.Host.React(),
    )
    laptop.openUri('/counters/1', Navigation.Link())
    expect(laptop.windowTitle()).toBe('Counter 1 | React')
  })
})
