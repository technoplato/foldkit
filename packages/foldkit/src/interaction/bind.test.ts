import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Host from '../processor/host.js'
import { App, handleOf } from '../test/apps/navigableCounter.js'
import { bind, whenSettled, windowTitleOfModel } from './bind.js'
import { Ready, Starting, type Status } from './interaction.js'

const startingDescription = 'Starting Counter…'

const appInteraction = Option.getOrThrow(Option.fromNullishOr(App.interaction))

const bindOn = (host: Host.Host, readStatus: () => Status = () => Ready()) =>
  bind(
    { ...App, interaction: { ...appInteraction, status: readStatus } },
    { ...handleOf(App), host },
  )

describe('bind', () => {
  it('names the window by the Host the Program was started on', () => {
    const bound = bindOn(Host.React())
    expect(bound.appLabel).toBe('React')
    expect(bound.windowTitle()).toBe('Counter | React')
  })

  it('titles the window with the Starting description until Ready', () => {
    const bound = bindOn(Host.Svelte(), () =>
      Starting({ description: startingDescription }),
    )
    expect(bound.windowTitle()).toBe('Starting Counter… | Svelte')
  })

  it('offers no menu opener until the Program is Ready', () => {
    const starting = bindOn(Host.ExpoIos(), () =>
      Starting({ description: startingDescription }),
    )
    expect(starting.menuOpener('Touch')).toEqual(Option.none())
    expect(Option.isSome(bindOn(Host.ExpoIos()).menuOpener('Touch'))).toBe(true)
  })

  it('titles a pure view the same way for its Host', () => {
    expect(windowTitleOfModel(App, App.init()[0], Host.Foldkit())).toBe(
      'Counter | Foldkit HTML',
    )
  })
})

describe('what a bound Program reads of one Model', () => {
  const countingScreens = () => {
    let painted = 0
    const program = {
      ...App,
      screen: (model: Parameters<NonNullable<typeof App.screen>>[0]) => {
        painted += 1
        return Option.getOrThrow(Option.fromNullishOr(App.screen))(model)
      },
    }
    return { bound: bind(program, handleOf(program)), painted: () => painted }
  }

  it('builds a page once for one Model, however many times a Client reads it', () => {
    const { bound, painted } = countingScreens()
    const first = bound.viewAt('/counter')
    const again = bound.viewAt('/counter')

    expect(Option.isSome(first)).toBe(true)
    expect(again).toBe(first)
    expect(painted()).toBe(1)
    expect(bound.navigation()).toBe(bound.navigation())
  })

  it('builds it again once the Model has changed', () => {
    const { bound, painted } = countingScreens()
    bound.viewAt('/counter')
    bound.press('Increment')
    bound.viewAt('/counter')

    expect(painted()).toBe(2)
  })
})

describe('whenSettled', () => {
  it('resolves at once for a Ready Program', async () => {
    await expect(whenSettled(bindOn(Host.Cli()), 10)).resolves.toBeUndefined()
  })

  it('rejects with the Starting description when it never settles', async () => {
    const bound = bindOn(Host.Cli(), () =>
      Starting({ description: startingDescription }),
    )
    await expect(whenSettled(bound, 10)).rejects.toThrow(
      'Still Starting Counter… after 0.01 seconds.',
    )
  })
})
