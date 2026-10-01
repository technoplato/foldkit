import { Duration, Effect, Equal, Option } from 'effect'
import { ActionMenu, Interaction, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'

import { startCounterOn } from './live.js'
import { type CounterHandle } from './startConfig.js'
import { SyncedCounter, type SyncedCounterModel } from './synced.js'

const started: Array<CounterHandle> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(handle => handle.stop()))
})

const settleAttempts = 200

const whenReady = (handle: CounterHandle): Promise<void> =>
  new Promise(resolve => {
    const check = (): void => {
      if (handle.readModel()._tag === 'Ready') {
        stop()
        resolve()
      }
    }
    const stop = handle.subscribe(check)
    check()
  })

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

const startOn = async (store: Runtime.MemoryStore, processor: string) => {
  const handle = startCounterOn(Runtime.Memory({ processor, store }))
  started.push(handle)
  await whenReady(handle)
  return Interaction.bind(SyncedCounter, handle)
}

const countOf = (
  bound: Readonly<{ readModel: () => SyncedCounterModel }>,
): number => {
  const model = bound.readModel()
  if (model._tag !== 'Ready') {
    throw new Error(`Expected Ready, got ${model._tag}`)
  }
  return model.count
}

const modeOf = (
  bound: Readonly<{ readModel: () => SyncedCounterModel }>,
): string => {
  const model = bound.readModel()
  return model._tag === 'Ready' ? model.session.mode : model._tag
}

describe('startCounterOn', () => {
  it('is Starting before the first snapshot and Disabled until then', () => {
    const handle = startCounterOn(Runtime.Memory({ processor: 'cli-1' }))
    started.push(handle)
    const bound = Interaction.bind(SyncedCounter, handle)
    expect(bound.status()).toEqual(Interaction.Starting())
    expect(
      bound.entries().every(entry => entry.availability._tag === 'Disabled'),
    ).toBe(true)
  })

  it('shares one count across two Processors', async () => {
    const store = Runtime.makeMemoryStore()
    const laptop = await startOn(store, 'react-laptop')
    const phone = await startOn(store, 'expo-phone')
    expect(laptop.press('Increment')).toBe(true)
    await eventually(() => countOf(phone), 1)
    expect(phone.press('Reset')).toBe(true)
    await eventually(() => countOf(laptop), 0)
  })

  it('mirrors the action menu by default', async () => {
    const store = Runtime.makeMemoryStore()
    const laptop = await startOn(store, 'react-laptop')
    const phone = await startOn(store, 'expo-phone')
    laptop.pressKey(Interaction.keyInput('k', { isMeta: true }))
    await eventually(() => Option.isSome(phone.menu()), true)
  })

  it('keeps every menu local once any device chooses it', async () => {
    const store = Runtime.makeMemoryStore()
    const laptop = await startOn(store, 'react-laptop')
    const phone = await startOn(store, 'expo-phone')
    expect(phone.press('KeepNavigationLocal')).toBe(true)
    await eventually(() => modeOf(laptop), 'SharedDomain')

    laptop.openMenu()
    expect(Option.isSome(laptop.menu())).toBe(true)
    expect(laptop.chooseFromMenu('Increment')).toBe(true)
    await eventually(() => countOf(phone), 1)
    expect(Option.isSome(phone.menu())).toBe(false)
    expect(Option.isSome(laptop.menu())).toBe(false)
  })

  it('sends a menu choice as the Action itself', async () => {
    const store = Runtime.makeMemoryStore()
    const laptop = await startOn(store, 'react-laptop')
    laptop.openMenu()
    laptop.chooseFromMenu('Increment')
    expect(
      store.messages.map(message =>
        typeof message === 'object' && message !== null && 'tag' in message
          ? message.tag
          : '',
      ),
    ).toEqual([
      'OpenedActionMenu',
      'Increment',
      `ChoseActionMenuAction:{"tag":"Increment"}`,
    ])
    expect(ActionMenu.isMessage(ActionMenu.OpenedActionMenu())).toBe(true)
  })
})
