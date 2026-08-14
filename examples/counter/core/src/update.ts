import { Match as M } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialCount } from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

/** Applies one Counter Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Decrement: () => [{ count: model.count - 1 }, []],
      Increment: () => [{ count: model.count + 1 }, []],
      Reset: () => {
        if (model.count === 0) {
          return [model, []]
        }
        return [{ count: initialCount }, []]
      },
    }),
  )
