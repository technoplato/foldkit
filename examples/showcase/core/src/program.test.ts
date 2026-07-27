import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import { init } from './init.js'
import { TappedBackButton, TappedCounterButton } from './message.js'
import {
  CalculatorScene,
  CounterScene,
  FactScene,
  HomeScene,
  MultipleCountersScene,
  type Navigation,
} from './model.js'
import { navigationToPath, urlToNavigation } from './route.js'
import { update } from './update.js'

const parsePath = (path: string): Navigation => {
  const maybeUrl = fromString(`https://showcase.invalid${path}`)
  if (Option.isSome(maybeUrl)) {
    return urlToNavigation(maybeUrl.value)
  }
  return HomeScene.make({})
}

describe('Showcase Program', () => {
  it('navigates after host interaction facts enter update', () => {
    const [homeModel] = init()
    const [counterModel] = update(homeModel, TappedCounterButton())
    const [returnedModel] = update(counterModel, TappedBackButton())

    expect(homeModel.navigation).toStrictEqual(HomeScene.make({}))
    expect(counterModel.navigation).toStrictEqual(CounterScene.make({}))
    expect(returnedModel.navigation).toStrictEqual(HomeScene.make({}))
  })

  it('round-trips every printable navigation scene', () => {
    const navigationValues: ReadonlyArray<Navigation> = [
      HomeScene.make({}),
      CounterScene.make({}),
      MultipleCountersScene.make({}),
      CalculatorScene.make({}),
      FactScene.make({}),
    ]

    for (const navigation of navigationValues) {
      expect(parsePath(navigationToPath(navigation))).toStrictEqual(navigation)
    }
  })
})
