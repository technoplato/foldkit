import { Effect, Schema as S } from 'effect'
import { Command } from 'foldkit'

import { CounterFactClient } from './counterFactClient.js'
import { FailedLoadCounterFact, SucceededLoadCounterFact } from './message.js'
import {
  CounterDetailPresentationId,
  CounterFactRequestId,
  CounterId,
} from './model.js'

// COMMAND

/** Fetches the favorite number fact for one counter. */
export const FetchCounterFact = Command.define(
  'FetchCounterFact',
  {
    counterId: CounterId,
    detailPresentationId: CounterDetailPresentationId,
    number: S.Number,
    requestId: CounterFactRequestId,
  },
  SucceededLoadCounterFact,
  FailedLoadCounterFact,
)(({ counterId, detailPresentationId, number, requestId }) =>
  Effect.gen(function* () {
    const client = yield* CounterFactClient
    const fact = yield* client.fetch(number)
    return SucceededLoadCounterFact({
      counterId,
      detailPresentationId,
      fact,
      requestId,
    })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(
        FailedLoadCounterFact({
          counterId,
          detailPresentationId,
          reason: 'Counter fact unavailable',
          requestId,
        }),
      ),
    ),
  ),
)
