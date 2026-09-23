import { Match as M, Number } from 'effect'
import type * as Command from 'foldkit/command'
import { evo } from 'foldkit/struct'

import { type Message } from './message.js'
import { type Model, initialCount } from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

/** Applies one Counter Message. Reset at 0 leaves the count at 0. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Increment: () => [evo(model, { count: Number.increment }), []],
      Decrement: () => [evo(model, { count: Number.decrement }), []],
      Reset: () => [evo(model, { count: () => initialCount }), []],
    }),
  )
