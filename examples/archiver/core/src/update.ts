import { Array, Match as M } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, QueuedArchive } from './model.js'

const trimmedUrl = (value: string): string => value.trim()

/** Applies one Archiver Message to the current Model. */
export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      UpdatedUrlDraft: ({ value }) => [{ ...model, urlDraft: value }, []],
      SubmittedArchiveUrl: () => {
        const url = trimmedUrl(model.urlDraft)
        if (url === '') {
          return [model, []]
        }
        const archive = {
          id: url,
          url,
          title: url,
          status: QueuedArchive(),
        }
        return [
          {
            urlDraft: '',
            archives: Array.append(model.archives, archive),
          },
          [],
        ]
      },
      ClickedArchive: () => [model, []],
    }),
  )
