import { Effect, Match as M } from 'effect'
import { Command } from 'foldkit'

import { FactClient } from './factClient.js'
import { FailedFetchFact, type Message, SucceededFetchFact } from './message.js'
import { Failed, Loaded, Loading, type Model } from './model.js'

/** Requests one Fact through the host-provided FactClient. */
export const FetchFact = Command.define(
  'FetchFact',
  SucceededFetchFact,
  FailedFetchFact,
)(
  Effect.flatMap(FactClient, client =>
    client.fetch.pipe(
      Effect.map(fact => SucceededFetchFact({ fact })),
      Effect.catch(error =>
        Effect.succeed(
          FailedFetchFact({ reason: globalThis.String(error.cause) }),
        ),
      ),
    ),
  ),
)

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, FactClient>>,
]

/** Applies one Fact Message and returns its finite Commands. */
export const update = (_model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      ClickedLoadFact: () => [Loading.make({}), [FetchFact()]],
      SucceededFetchFact: ({ fact }) => [Loaded.make({ fact }), []],
      FailedFetchFact: ({ reason }) => [Failed.make({ reason }), []],
    }),
  )
