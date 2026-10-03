import { Duration, Effect, Equal, Option } from 'effect'
import { ActionMenu, Interaction, Navigation, Runtime } from 'foldkit'
import { keyInput } from 'foldkit/interaction'
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

const uriOf = (
  bound: Readonly<{
    navigation: () => Option.Option<Navigation.CarrierPlan<unknown>>
  }>,
): string =>
  Option.match(bound.navigation(), {
    onNone: () => 'no plan',
    onSome: plan => plan.uri,
  })

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
    expect(bound.status()).toEqual(
      Interaction.Starting({ description: 'Starting Counter…' }),
    )
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

  it('opens the Session page from a URI on every device while mirrored', async () => {
    const store = Runtime.makeMemoryStore()
    const laptop = await startOn(store, 'react-laptop')
    const phone = await startOn(store, 'expo-phone')
    expect(laptop.openUri('/counter/session', Navigation.Link())).toBe(true)
    await eventually(() => uriOf(phone), '/counter/session')
  })

  it('keeps mirroring every move when devices boot from a shared local snapshot', async () => {
    const store = Runtime.makeMemoryStore()
    const snapshots = Runtime.LocalSnapshot.memory()
    const saveInterval = Duration.millis(1100)
    const startShared = async (processor: string) => {
      const handle = startCounterOn(
        Runtime.Memory({ processor, store }),
        snapshots,
      )
      started.push(handle)
      await whenReady(handle)
      return Interaction.bind(SyncedCounter, handle)
    }
    const openSession = (
      bound: Awaited<ReturnType<typeof startShared>>,
    ): void => {
      bound.openMenu()
      bound.typeInMenu('open session')
      bound.pressKey(keyInput('Enter'))
    }
    const seed = await startShared('react-seed')
    seed.press('Increment')
    await Effect.runPromise(Effect.sleep(saveInterval))
    const laptop = await startShared('react-laptop')
    const tablet = await startShared('react-tablet')
    openSession(tablet)
    await eventually(() => uriOf(laptop), '/counter/session')
    expect(laptop.navigateBack('/counter')).toBe(true)
    await eventually(() => uriOf(tablet), '/counter')
    await Effect.runPromise(Effect.sleep(saveInterval))
    openSession(tablet)
    await eventually(() => uriOf(laptop), '/counter/session')
    const phone = await startShared('expo-phone')
    await eventually(() => uriOf(phone), '/counter/session')
    phone.pressKey(keyInput('Escape'))
    await eventually(() => uriOf(laptop), '/counter')
    await eventually(() => uriOf(tablet), '/counter')
    await eventually(() => countOf(phone), 1)
  })

  it('prints the menu over the Session page as one URI', async () => {
    const laptop = await startOn(Runtime.makeMemoryStore(), 'react-laptop')
    laptop.press('OpenSessionSettings')
    laptop.openMenu()
    laptop.typeInMenu('in')
    expect(uriOf(laptop)).toBe('/counter/session/menu?menu.q=in')
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
      `ChoseActionMenuAction:{"tag":"Increment"}`,
      'Increment',
    ])
    expect(ActionMenu.isMessage(ActionMenu.OpenedActionMenu())).toBe(true)
  })
})
