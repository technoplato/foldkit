import { type Command, Navigation } from 'foldkit'

import { type Destination, ReadAloudShelf } from './destination.js'
import type { Message } from './message.js'
import { type Model, ReadingsLoading } from './model.js'

// INIT

/** Starts on the shelf, waiting for the readings, with no preview checked. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [
  {
    readings: ReadingsLoading(),
    previewChecks: [],
    navigation: Navigation.stackAtRoot<Destination>(ReadAloudShelf()),
  },
  [],
]
