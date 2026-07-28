import { Match as M } from 'effect'
import type * as Command from 'foldkit/command'
import { evo } from 'foldkit/struct'

import {
  nextSlideId,
  previousSlideId,
  slideIdForPlaybackSeconds,
} from './deck.js'
import type { Message } from './message.js'
import { type Model, VideoPlaybackControl } from './model.js'

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

/** Applies one host-neutral deck Message. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      AdvancedSlide: ({ origin }) => [
        evo(model, {
          currentSlideId: currentSlideId => nextSlideId(currentSlideId),
          lastControl: () => origin,
        }),
        [],
      ],
      RewoundSlide: ({ origin }) => [
        evo(model, {
          currentSlideId: currentSlideId => previousSlideId(currentSlideId),
          lastControl: () => origin,
        }),
        [],
      ],
      SelectedSlide: ({ origin, slideId }) => [
        evo(model, {
          currentSlideId: () => slideId,
          lastControl: () => origin,
        }),
        [],
      ],
      ObservedPlayback: ({ seconds }) => {
        const currentSlideId = slideIdForPlaybackSeconds(seconds)
        return currentSlideId === model.currentSlideId
          ? [model, []]
          : [
              evo(model, {
                currentSlideId: () => currentSlideId,
                lastControl: () => VideoPlaybackControl(),
              }),
              [],
            ]
      },
    }),
  )
