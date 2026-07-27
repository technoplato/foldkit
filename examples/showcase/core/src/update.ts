import { Match as M } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import {
  CalculatorScene,
  CounterScene,
  FactScene,
  HomeScene,
  type Model,
  MultipleCountersScene,
  type Navigation,
  WalletScene,
} from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const navigate = (model: Model, nextNavigation: Navigation): UpdateReturn => [
  { ...model, navigation: nextNavigation },
  [],
]

/** Applies one showcase navigation Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      TappedCounterButton: () => navigate(model, CounterScene.make({})),
      TappedMultipleCountersButton: () =>
        navigate(model, MultipleCountersScene.make({})),
      TappedCalculatorButton: () => navigate(model, CalculatorScene.make({})),
      TappedFactButton: () => navigate(model, FactScene.make({})),
      TappedWalletButton: () => navigate(model, WalletScene.make({})),
      TappedBackButton: () => navigate(model, HomeScene.make({})),
      OpenedNavigation: ({ navigation }) => navigate(model, navigation),
    }),
  )
