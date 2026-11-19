import { Match as M } from 'effect'
import { evo } from 'foldkit/struct'

import type { Message } from './message.js'
import { FailedQuestions, LoadedQuestions, type Model } from './model.js'

/** Folds one questions Message into the Submodel. Nothing here starts a Command: the questions are observed. */
export const update = (model: Model, message: Message): Model =>
  M.value(message).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      ObservedQuestions: ({ questions, unreadableCount, isLimitReached }) =>
        evo(model, {
          state: () =>
            LoadedQuestions({ questions, unreadableCount, isLimitReached }),
        }),
      FailedObserveQuestions: ({ reason }) =>
        evo(model, { state: () => FailedQuestions({ reason }) }),
      UpdatedQuestionSearch: ({ value }) => evo(model, { search: () => value }),
      ClickedQuestionFilter: ({ filter }) =>
        evo(model, { filter: () => filter }),
    }),
  )

/** The Submodel a route opens with: its `q`, searched for. */
export const withSearch = (model: Model, search: string): Model =>
  evo(model, { search: () => search })
