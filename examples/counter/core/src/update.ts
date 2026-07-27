import { Match as M } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialCount } from './model.js'

// UPDATE

/** Applies one Counter Message to the current Model. */
export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      ClickedDecrement: () => [{ count: model.count - 1 }, []],
      ClickedIncrement: () => [{ count: model.count + 1 }, []],
      ClickedReset: () => [{ count: initialCount }, []],
    }),
  )
