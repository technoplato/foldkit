import { Option } from 'effect'
import { Navigation } from 'foldkit'
import type { Command } from 'foldkit'

import { type Destination, LibraryPage } from './destination.js'
import type { Message } from './message.js'
import { Idle, type Model, ShelfLoading } from './model.js'

// INIT

/** Starts on the library, waiting for the shelf, with nothing loaded. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [
  {
    library: ShelfLoading(),
    listening: Idle(),
    speed: 1,
    maybeProblem: Option.none(),
    maybeNotice: Option.none(),
    navigation: Navigation.stackAtRoot<Destination>(LibraryPage()),
  },
  [],
]
