import { Array, Effect, Option } from 'effect'
import { Theme } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  AppearanceStore,
  appearanceChoicesOf,
  contrastOf,
  makeMemoryAppearanceStore,
  modeOf,
} from './appearance.js'
import { RecordingListRoute } from './link.js'
import {
  ChoseAppearance,
  type Message,
  ObservedSystemContrast,
  ObservedSystemMode,
  ReadKeptAppearance,
} from './message.js'
import type { Model } from './model.js'
import { modelForRoute, startupCommands, update } from './update.js'

const start = (): Model => modelForRoute(RecordingListRoute())

const after = (messages: ReadonlyArray<Message>): Model =>
  Array.reduce(messages, start(), (model, message) => update(model, message)[0])

describe('how the words page looks, as state', () => {
  it('follows the system from the start, light until the system is heard from', () => {
    expect(start().appearance).toEqual(Theme.initialAppearance)
    expect(modeOf(start())).toBe('Light')
    expect(modeOf(after([ObservedSystemMode({ mode: 'Dark' })]))).toBe('Dark')
  })

  it('keeps a choice of light or dark whatever the system says, and goes back to following it', () => {
    const chosen = after([
      ObservedSystemMode({ mode: 'Dark' }),
      ChoseAppearance({ appearance: 'Light' }),
    ])
    expect(modeOf(chosen)).toBe('Light')
    expect(
      modeOf(update(chosen, ChoseAppearance({ appearance: 'System' }))[0]),
    ).toBe('Dark')
  })

  it('keeps the choice on the device when it is made, and reads it at the start', () => {
    const [, commands] = update(
      start(),
      ChoseAppearance({ appearance: 'Dark' }),
    )
    expect(Array.map(commands, command => command.name)).toEqual([
      'KeepAppearance',
    ])
    expect(Array.map(startupCommands, command => command.name)).toContain(
      'ReadAppearance',
    )
    expect(
      modeOf(
        after([ReadKeptAppearance({ maybeAppearance: Option.some('Dark') })]),
      ),
    ).toBe('Dark')
    expect(
      after([ReadKeptAppearance({ maybeAppearance: Option.none() })])
        .appearance,
    ).toEqual(Theme.initialAppearance)
  })

  it('offers the three looks, saying which is in use', () => {
    expect(
      appearanceChoicesOf(after([ChoseAppearance({ appearance: 'Dark' })])),
    ).toEqual([
      { appearance: 'System', label: 'Follow the System', isChosen: false },
      { appearance: 'Light', label: 'Light', isChosen: false },
      { appearance: 'Dark', label: 'Dark', isChosen: true },
    ])
  })

  it('has a store that keeps the choice in memory for a test, and one that keeps nothing by default', async () => {
    const kept = makeMemoryAppearanceStore(Option.none())
    const read = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* AppearanceStore
        const before = yield* store.read
        yield* store.keep('Dark')
        return [before, yield* store.read] as const
      }).pipe(Effect.provide(kept)),
    )
    expect(read).toEqual([Option.none(), Option.some('Dark')])
    const byDefault = await Effect.runPromise(
      Effect.flatMap(AppearanceStore, store => store.read),
    )
    expect(byDefault).toEqual(Option.none())
  })

  it('is painted with the usual contrast until the system is heard to ask for more', () => {
    expect(contrastOf(start())).toBe('Standard')
    expect(
      contrastOf(after([ObservedSystemContrast({ contrast: 'More' })])),
    ).toBe('More')
    expect(
      modeOf(
        after([
          ObservedSystemMode({ mode: 'Dark' }),
          ObservedSystemContrast({ contrast: 'More' }),
        ]),
      ),
    ).toBe('Dark')
  })
})
