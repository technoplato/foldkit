import { Effect } from 'effect'
import { Command } from 'foldkit'

import {
  FailedCreateSession,
  FailedVerify,
  SucceededCreateSession,
  SucceededVerify,
} from './message.js'
import { PaymentProcessor, SessionRequest, VerifyRequest } from './processor.js'

/** Asks the injected processor to create a provider session. */
export const CreateSession = Command.define(
  'CreateSession',
  { request: SessionRequest },
  SucceededCreateSession,
  FailedCreateSession,
)(({ request }) =>
  PaymentProcessor.pipe(
    Effect.flatMap(processor => processor.createSession(request)),
    Effect.map(offer => SucceededCreateSession({ offer })),
    Effect.catch(error =>
      Effect.succeed(FailedCreateSession({ why: error.why })),
    ),
  ),
)

/** Asks the injected processor to verify a provider session. */
export const VerifyPayment = Command.define(
  'VerifyPayment',
  { request: VerifyRequest },
  SucceededVerify,
  FailedVerify,
)(({ request }) =>
  PaymentProcessor.pipe(
    Effect.flatMap(processor => processor.verify(request)),
    Effect.map(receipt => SucceededVerify({ receipt })),
    Effect.catch(error => Effect.succeed(FailedVerify({ why: error.why }))),
  ),
)
