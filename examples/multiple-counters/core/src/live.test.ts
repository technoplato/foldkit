import { Duration, Effect, Equal, Option } from 'effect'
import { Interaction, Navigation, Processor, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'

import { startCountersAt, startCountersOn } from './live.js'
import { type CountersHandle, asksForMemoryEngine } from './startConfig.js'
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
    undefined,
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
    phone.press('Add')
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
    laptop.press('Open:1')
    expect(uriOf(laptop)).toBe('/counters/1')
    phone.press('Delete:1')
    phone.press('ConfirmDelete')
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

describe('Multiple Counters kept to one window', () => {
  it('asks for it only with engine=memory in the address', () => {
    expect(asksForMemoryEngine('?engine=memory')).toBe(true)
    expect(asksForMemoryEngine('?presenter=a&engine=memory')).toBe(true)
    expect(asksForMemoryEngine('?engine=instant')).toBe(false)
    expect(asksForMemoryEngine('')).toBe(false)
  })

  it('starts each window from Counter 1 at 0 and shares nothing', async () => {
    const open = async () => {
      const handle = startCountersAt(
        { host: Processor.Host.React(), instance: 'window' },
        '?engine=memory',
      )
      started.push(handle)
      const bound = Interaction.bind(SyncedCounters, handle)
      await Interaction.whenSettled(bound, 2_000)
      return bound
    }
    const first = await open()
    const second = await open()
    expect(countsOf(first)).toEqual([[1, 0]])
    first.press('Add')
    first.press('Increment:2')
    await eventually(
      () => countsOf(first),
      [
        [1, 0],
        [2, 1],
      ],
    )
    expect(countsOf(second)).toEqual([[1, 0]])
  })

  it('opens a deep link to Counter 1 whatever a shared log holds', async () => {
    const handle = startCountersAt(
      { host: Processor.Host.React(), instance: 'window' },
      '?engine=memory',
    )
    started.push(handle)
    const bound = Interaction.bind(SyncedCounters, handle)
    await Interaction.whenSettled(bound, 2_000)
    expect(bound.openUri('/counters/1/delete/1', Navigation.Launch())).toBe(
      true,
    )
    await eventually(() => uriOf(bound), '/counters/1/delete/1')
  })
})
