import { Array, Effect, Layer, Option, Stream } from 'effect'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import {
  ObservedSystemMode,
  SetAppearance,
  SystemAppearance,
  catalog,
  initialAppearance,
  modeOfState,
  systemModeStream,
  update,
} from './appearance.js'

describe('what SetAppearance touches', () => {
  const states = [initialAppearance]
  const touching = (
    state: typeof initialAppearance,
    message: typeof SetAppearance.Type,
  ) => [update(state, message), []] as const

  it('is the choice of look, and nothing else', () => {
    expect(Catalog.declarationOf(SetAppearance).touches).toEqual({
      mutates: ['appearance'],
      triggers: [],
    })
    expect(Catalog.undeclaredTouches(catalog, touching, states)).toEqual([])
    expect(Catalog.unseenTouches(catalog, touching, states)).toEqual([])
  })
})

describe('appearance as state', () => {
  it('starts following the system, in light until the system says otherwise', () => {
    expect(initialAppearance).toEqual({
      appearance: 'System',
      systemMode: 'Light',
    })
    expect(modeOfState(initialAppearance)).toBe('Light')
  })

  it('takes the mode of the system as a fact, and the choice of a person as an Action', () => {
    const inDarkRoom = update(
      initialAppearance,
      ObservedSystemMode({ mode: 'Dark' }),
    )
    expect(modeOfState(inDarkRoom)).toBe('Dark')
    const choseLight = update(
      inDarkRoom,
      SetAppearance({ appearance: 'Light' }),
    )
    expect(choseLight).toEqual({ appearance: 'Light', systemMode: 'Dark' })
    expect(modeOfState(choseLight)).toBe('Light')
    expect(
      modeOfState(update(choseLight, SetAppearance({ appearance: 'System' }))),
    ).toBe('Dark')
  })

  it('offers the three looks by name, the one in use marked as such', () => {
    const [entry] = Catalog.entries(catalog, initialAppearance)
    const choices = Option.getOrThrow(
      Option.fromNullishOr(entry),
    ).maybeChoices.pipe(Option.getOrThrow).choices
    expect(Array.map(choices, choice => [choice.token, choice.title])).toEqual([
      ['System', 'Follow the system'],
      ['Light', 'Light'],
      ['Dark', 'Dark'],
    ])
    expect(Array.map(choices, choice => choice.availability._tag)).toEqual([
      'Disabled',
      'Enabled',
      'Enabled',
    ])
  })

  it('hears the mode of the system from the host as Messages', async () => {
    const host = Layer.succeed(SystemAppearance, {
      modes: Stream.make('Light', 'Dark'),
    })
    const heard = await Effect.runPromise(
      Stream.runCollect(systemModeStream).pipe(Effect.provide(host)),
    )
    expect(Array.fromIterable(heard)).toEqual([
      ObservedSystemMode({ mode: 'Light' }),
      ObservedSystemMode({ mode: 'Dark' }),
    ])
  })
})

describe('the components at the edge', () => {
  const painters = [
    'src/renderers/html.ts',
    'src/interaction/screenStyles.ts',
    'src/interaction/menuStyles.ts',
    '../react/src/paintReact/paintReact.tsx',
    '../react/src/navigation/navigation.tsx',
  ]

  it('are told the mode and never ask the system, storage or the page for it', () => {
    for (const painter of painters) {
      const source = readFileSync(join(process.cwd(), painter), 'utf8')
      expect(source, painter).not.toMatch(
        /prefers-color-scheme|localStorage|sessionStorage/,
      )
    }
  })
})
