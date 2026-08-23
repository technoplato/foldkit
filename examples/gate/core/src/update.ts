import { Match as M } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'

import { ReadOrigin } from './command.js'
import { type Message } from './message.js'
import { Failed, type Model, Read, Reading } from './model.js'
import { GateOrigin } from './origin.js'

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, GateOrigin>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

/** Applies one Gate Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedRefresh: () => {
        if (model.origin._tag === 'Reading') {
          return [model, []]
        }
        return [
          evo(model, {
            origin: () => Reading(),
          }),
          [ReadOrigin()],
        ]
      },
      SucceededReadOrigin: ({ rate, messages }) => [
        evo(model, {
          origin: () => Read({ rate, messages }),
        }),
        [],
      ],
      FailedReadOrigin: ({ reason }) => [
        evo(model, {
          origin: () => Failed({ reason }),
        }),
        [],
      ],
    }),
  )
