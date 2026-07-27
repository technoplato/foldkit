import { Match as M } from 'effect'
import type { Command } from 'foldkit'

import { type Message } from './message.js'
import { Model, ShowingCaptures, ShowingLiveClient } from './model.js'

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

/** Applies one Client Matrix Message to the Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      SelectedScreenMode: ({ mode }) => [
        Model.make({ ...model, selectedMode: mode }),
        [],
      ],
      SelectedMatrixOrientation: ({ orientation }) => [
        Model.make({ ...model, orientation }),
        [],
      ],
      OpenedLiveClient: ({ medium, mode }) => [
        Model.make({
          ...model,
          liveClientState: ShowingLiveClient.make({ medium, mode }),
          selectedMode: mode,
        }),
        [],
      ],
      ClosedLiveClient: () => [
        Model.make({
          ...model,
          liveClientState: ShowingCaptures.make({}),
        }),
        [],
      ],
    }),
  )
