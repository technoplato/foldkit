import { init as initCounter } from 'counter-core-example'
import { Navigation } from 'foldkit'
import type * as Command from 'foldkit/command'

import { CounterId, firstCounterId } from './counterId.js'
import { CounterList, type Destination } from './destination.js'
import type { Message } from './message.js'
import type { Model } from './model.js'

// INIT

/** Starts with Counter 1 at 0 on the list. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [
  {
    counters: [{ counterId: firstCounterId, counter: initCounter()[0] }],
    nextCounterId: CounterId.make(firstCounterId + 1),
    navigation: Navigation.stackAtRoot<Destination>(CounterList()),
  },
  [],
]
