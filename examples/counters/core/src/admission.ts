import { Data, Match as M, Result, Schema as S, SchemaParser } from 'effect'
import {
  type InteractionAdmissionError,
  InteractionAdmissionOccurrence,
  InteractionInvocationFacts,
  InteractionOccurrenceId,
  InvalidInteractionInvocationFactsError,
  MismatchedInteractionInvocationOccurrenceIdError,
  interactionAdmissionLimits,
} from 'foldkit/interaction-graph'
import { makeMessageAdmission } from 'foldkit/program'

import type { CounterFactClient } from './counterFactClient.js'
import { MultipleCountersInteractionAdmission } from './interactionGraph.js'
import type { Message } from './message.js'
import type { Model } from './model.js'
import {
  type NavigationCarrierResolutionError,
  resolveNavigationCarrier,
} from './navigationCarrier.js'
import { MultipleCountersProgram } from './program.js'

const NavigationCarrierDestinationUri = S.String.check(
  S.isLengthBetween(1, interactionAdmissionLimits.destinationUriLength),
)

/** Invokes one bounded semantic interaction occurrence. */
export const InteractionInvocation = S.TaggedStruct('InteractionInvocation', {
  occurrence: InteractionAdmissionOccurrence,
})
/** Invokes one bounded semantic interaction occurrence. */
export type InteractionInvocation = typeof InteractionInvocation.Type

/** Invokes one bounded Program navigation carrier. */
export const NavigationCarrierInvocation = S.TaggedStruct(
  'NavigationCarrierInvocation',
  {
    destinationUri: NavigationCarrierDestinationUri,
    occurrenceId: InteractionOccurrenceId,
  },
)
/** Invokes one bounded Program navigation carrier. */
export type NavigationCarrierInvocation =
  typeof NavigationCarrierInvocation.Type

/** Every authenticated Message claim accepted by the Multiple Counters Program. */
export const MultipleCountersAdmissionClaim = S.Union([
  InteractionInvocation,
  NavigationCarrierInvocation,
])
/** Every authenticated Message claim accepted by the Multiple Counters Program. */
export type MultipleCountersAdmissionClaim =
  typeof MultipleCountersAdmissionClaim.Type

/** A raw Multiple Counters admission claim did not satisfy its strict Schema. */
export class InvalidMultipleCountersAdmissionClaimError extends Data.TaggedError(
  'InvalidMultipleCountersAdmissionClaimError',
)<{ readonly cause: unknown }> {}

/** Every typed rejection produced while resolving a Multiple Counters claim. */
export type MultipleCountersAdmissionError =
  | InteractionAdmissionError
  | NavigationCarrierResolutionError

/** Strictly decodes one bounded claim without discarding unknown wire fields. */
export const decodeMultipleCountersAdmissionClaim = (
  input: unknown,
): Result.Result<
  MultipleCountersAdmissionClaim,
  InvalidMultipleCountersAdmissionClaimError
> =>
  Result.mapError(
    SchemaParser.decodeUnknownResult(MultipleCountersAdmissionClaim, {
      onExcessProperty: 'error',
    })(input),
    cause => new InvalidMultipleCountersAdmissionClaimError({ cause }),
  )

/** Extracts the authenticated occurrence identity claimed by one invocation. */
export const multipleCountersAdmissionOccurrenceId = (
  claim: MultipleCountersAdmissionClaim,
): InteractionOccurrenceId =>
  M.value(claim).pipe(
    M.withReturnType<InteractionOccurrenceId>(),
    M.tagsExhaustive({
      InteractionInvocation: ({ occurrence }) => occurrence.occurrenceId,
      NavigationCarrierInvocation: ({ occurrenceId }) => occurrenceId,
    }),
  )

/** Resolves one decoded authenticated claim into exactly one Program Message. */
export const resolveMultipleCountersAdmissionClaim = (
  model: Model,
  claim: MultipleCountersAdmissionClaim,
  invocationFacts: unknown,
): Result.Result<Message, MultipleCountersAdmissionError> => {
  const parsedInvocationFacts = SchemaParser.decodeUnknownResult(
    InteractionInvocationFacts,
  )(invocationFacts)
  if (Result.isFailure(parsedInvocationFacts)) {
    return Result.fail(
      new InvalidInteractionInvocationFactsError({
        cause: parsedInvocationFacts.failure,
      }),
    )
  }
  return M.value(claim).pipe(
    M.withReturnType<Result.Result<Message, MultipleCountersAdmissionError>>(),
    M.tagsExhaustive({
      InteractionInvocation: ({ occurrence }) =>
        MultipleCountersInteractionAdmission.resolve(
          model,
          occurrence,
          parsedInvocationFacts.success,
        ),
      NavigationCarrierInvocation: ({ destinationUri, occurrenceId }) => {
        if (occurrenceId !== parsedInvocationFacts.success.occurrenceId) {
          return Result.fail(
            new MismatchedInteractionInvocationOccurrenceIdError({
              authenticatedOccurrenceId:
                parsedInvocationFacts.success.occurrenceId,
              claimedOccurrenceId: occurrenceId,
            }),
          )
        } else {
          return resolveNavigationCarrier(
            model,
            destinationUri,
            parsedInvocationFacts.success,
          )
        }
      },
    }),
  )
}

/** The portable Program-owned definition used by authenticated authorities. */
export const MultipleCountersMessageAdmission = makeMessageAdmission<
  Model,
  Message,
  MultipleCountersAdmissionClaim,
  InvalidMultipleCountersAdmissionClaimError,
  MultipleCountersAdmissionError,
  CounterFactClient
>({
  program: MultipleCountersProgram,
  Claim: MultipleCountersAdmissionClaim,
  decodeClaim: decodeMultipleCountersAdmissionClaim,
  occurrenceId: multipleCountersAdmissionOccurrenceId,
  resolve: resolveMultipleCountersAdmissionClaim,
})
