import { Array, Option } from 'effect'
import { Catalog } from 'foldkit'
import * as Theme from 'foldkit/theme'
import { describe, expect, it } from 'vitest'

import { App } from './app.js'
import { SetAppearance, catalog } from './message.js'
import { BooksProgram } from './program.js'

const started = () => App.init()[0]

const modeOf = (model: ReturnType<typeof started>) =>
  Theme.modeOfState(model.appearance)

describe('the look of Books', () => {
  it('follows the system from the start, and takes the mode the host reports', () => {
    expect(started().appearance).toEqual(Theme.initialAppearance)
    const inDarkRoom = App.update(
      started(),
      Theme.ObservedSystemMode({ mode: 'Dark' }),
    )[0]
    expect(modeOf(inDarkRoom)).toBe('Dark')
  })

  it('is set by an Action in the Catalog, with a description, by name', () => {
    const entry = Option.getOrThrow(
      Array.findFirst(
        Catalog.entries(catalog, started()),
        each => each.tag === SetAppearance.tag,
      ),
    )
    expect(entry.what).toBe(
      'Sets the look to light, to dark, or to follow the system',
    )
    const inDarkRoom = App.update(
      started(),
      Theme.ObservedSystemMode({ mode: 'Dark' }),
    )[0]
    const choseLight = App.update(
      inDarkRoom,
      Option.getOrThrow(
        Catalog.messageFor(catalog, inDarkRoom, 'SetAppearance:Light'),
      ),
    )[0]
    expect(choseLight.appearance.appearance).toBe('Light')
    expect(modeOf(choseLight)).toBe('Light')
  })

  it('stays on this device for now: its Messages never reach the log, and a refold keeps it', () => {
    const synchronization = Option.getOrThrow(
      Option.fromNullishOr(BooksProgram.synchronization),
    )
    expect(
      synchronization.isLocalOnly?.(Theme.ObservedSystemMode({ mode: 'Dark' })),
    ).toBe(true)
    expect(
      synchronization.isLocalOnly?.(SetAppearance({ appearance: 'Dark' })),
    ).toBe(true)
  })
})
