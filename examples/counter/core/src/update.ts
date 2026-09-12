import { Match as M, Option } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { Model, initialCount } from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const withCount = (model: Model, count: number): Model =>
  Model.make({
    count,
    maybeDevice: model.maybeDevice,
    maybePath: model.maybePath,
  })

/** Applies one Counter Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Decrement: () => [withCount(model, model.count - 1), []],
      Increment: () => [withCount(model, model.count + 1), []],
      Reset: () => {
        if (model.count === 0) {
          return [model, []]
        }
        return [withCount(model, initialCount), []]
      },
      OpenedNavigation: ({ device, path }) => [
        Model.make({
          count: model.count,
          maybeDevice:
            device === undefined ? model.maybeDevice : Option.some(device),
          maybePath: path === undefined ? model.maybePath : Option.some(path),
        }),
        [],
      ],
    }),
  )
