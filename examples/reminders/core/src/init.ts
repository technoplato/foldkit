import { Option } from 'effect'
import { Navigation } from 'foldkit'
import type { Command } from 'foldkit'

import { type Destination, HomePage } from './destination.js'
import type { Message } from './message.js'
import { BoardLoading, type Model } from './model.js'

// INIT

/**
 * Starts on home, waiting for the board and today's date, in Reminders
 * V3's own order with done reminders hidden.
 */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [
  {
    board: BoardLoading(),
    maybeToday: Option.none(),
    ordering: 'Manual',
    completed: 'Hidden',
    maybeProblem: Option.none(),
    maybeNotice: Option.none(),
    navigation: Navigation.stackAtRoot<Destination>(HomePage()),
  },
  [],
]
