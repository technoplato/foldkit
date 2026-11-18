import { Array, Match as M, Option } from 'effect'
import { AsyncData, Command } from 'foldkit'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import {
  FetchMe,
  FetchUnderstanding,
  LoadExternal,
  NavigateInternal,
} from './command'
import { type Me, UNDERSTANDING_FILE } from './data'
import type { Message } from './message'
import { MeData, type Model, UnderstandingData } from './model'
import { urlToDestination } from './route'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

/**
 * What the page does with the user's understanding once it knows who is
 * signed in: a folder without the profile reads None at once, with nothing
 * fetched; a folder with one loads it, or refreshes what is shown, unless a
 * load is already on its way.
 */
export const understandingFor = (
  me: Me,
  current: Model['understanding'],
): readonly [
  Model['understanding'],
  ReadonlyArray<Command.Command<Message>>,
] => {
  if (!Array.contains(me.files, UNDERSTANDING_FILE)) {
    return [UnderstandingData.Success({ data: Option.none() }), []]
  }
  return Option.match(AsyncData.revalidateOrLoad(current), {
    onNone: () => [current, []],
    onSome: next => [next, [FetchUnderstanding()]],
  })
}

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            Internal: ({ url }) => [
              model,
              [NavigateInternal({ url: urlToString(url) })],
            ],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),
      ChangedUrl: ({ url }) => [
        evo(model, { destination: () => urlToDestination(url) }),
        [],
      ],
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],
      SucceededFetchMe: ({ me }) => {
        const [nextUnderstanding, commands] = understandingFor(
          me,
          model.understanding,
        )
        return [
          evo(model, {
            me: () => MeData.Success({ data: me }),
            understanding: () => nextUnderstanding,
          }),
          commands,
        ]
      },
      FailedFetchMe: ({ error }) => [
        evo(model, {
          me: current =>
            Option.match(AsyncData.getData(current), {
              onNone: () => MeData.Failure({ error }),
              onSome: data => MeData.Stale({ error, data }),
            }),
        }),
        [],
      ],
      SucceededFetchUnderstanding: ({ understanding }) => [
        evo(model, {
          understanding: () =>
            UnderstandingData.Success({ data: Option.some(understanding) }),
        }),
        [],
      ],
      FailedFetchUnderstanding: ({ error }) => [
        evo(model, {
          understanding: current =>
            Option.match(AsyncData.getData(current), {
              onNone: () => UnderstandingData.Failure({ error }),
              onSome: data => UnderstandingData.Stale({ error, data }),
            }),
        }),
        [],
      ],
      ClickedReload: () =>
        Option.match(AsyncData.revalidateOrLoad(model.me), {
          onNone: () => [model, []],
          onSome: nextMe => [evo(model, { me: () => nextMe }), [FetchMe()]],
        }),
    }),
  )
