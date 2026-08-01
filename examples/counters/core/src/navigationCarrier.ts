import {
  Array,
  Data,
  Match as M,
  Option,
  Result,
  Schema as S,
  SchemaParser,
} from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'

import { interactionIdentitySourceForOccurrence } from './interactionGraph.js'
import {
  Message,
  type NavigationTarget,
  OpenedNavigation,
  openingForTarget,
} from './message.js'
import type { CounterId, Model } from './model.js'
import { navigationTargetToPath, pathToNavigationTarget } from './route.js'

/** A navigation carrier URI did not name a Program route. */
export class InvalidNavigationCarrierUriError extends Data.TaggedError(
  'InvalidNavigationCarrierUriError',
)<{ readonly destinationUri: string }> {}

/** A navigation carrier URI named a route without its canonical spelling. */
export class NonCanonicalNavigationCarrierUriError extends Data.TaggedError(
  'NonCanonicalNavigationCarrierUriError',
)<{
  readonly actualDestinationUri: string
  readonly expectedDestinationUri: string
}> {}

/** A navigation carrier named a Counter absent from the current Model. */
export class MissingNavigationCarrierDestinationError extends Data.TaggedError(
  'MissingNavigationCarrierDestinationError',
)<{
  readonly counterId: CounterId
  readonly destinationUri: string
}> {}

/** Authenticated navigation invocation facts did not satisfy their Schema. */
export class InvalidNavigationCarrierInvocationFactsError extends Data.TaggedError(
  'InvalidNavigationCarrierInvocationFactsError',
)<{ readonly cause: unknown }> {}

/** A resolved navigation carrier Message did not satisfy the Program Schema. */
export class InvalidNavigationCarrierMessageError extends Data.TaggedError(
  'InvalidNavigationCarrierMessageError',
)<{ readonly cause: unknown }> {}

/** The Program-owned carrier operation that raised a synchronous defect. */
export const NavigationCarrierResolutionOperation = S.Literals([
  'ParseDestinationUri',
  'PrintDestinationUri',
  'ConstructOpening',
  'ConstructMessage',
  'ResolveCarrier',
])
/** The Program-owned carrier operation that raised a synchronous defect. */
export type NavigationCarrierResolutionOperation =
  typeof NavigationCarrierResolutionOperation.Type

/** A Program-owned navigation carrier operation threw before returning a decision. */
export class NavigationCarrierResolutionDefectError extends Data.TaggedError(
  'NavigationCarrierResolutionDefectError',
)<{
  readonly cause: unknown
  readonly operation: NavigationCarrierResolutionOperation
}> {}

/** Every typed failure while resolving a Multiple Counters navigation carrier. */
export type NavigationCarrierResolutionError =
  | InvalidNavigationCarrierUriError
  | NonCanonicalNavigationCarrierUriError
  | MissingNavigationCarrierDestinationError
  | InvalidNavigationCarrierInvocationFactsError
  | InvalidNavigationCarrierMessageError
  | NavigationCarrierResolutionDefectError

const maybeTargetCounterId = (
  target: NavigationTarget,
): Option.Option<CounterId> =>
  M.value(target).pipe(
    M.withReturnType<Option.Option<CounterId>>(),
    M.tagsExhaustive({
      CounterListTarget: () => Option.none(),
      CounterDetailTarget: ({ counterId }) => Option.some(counterId),
      CounterFactTarget: ({ counterId }) => Option.some(counterId),
      DeleteCounterTarget: ({ counterId }) => Option.some(counterId),
    }),
  )

const resolutionDefect = (
  operation: NavigationCarrierResolutionOperation,
  cause: unknown,
): NavigationCarrierResolutionDefectError =>
  new NavigationCarrierResolutionDefectError({ cause, operation })

const resolveNavigationCarrierResult = (
  model: Model,
  destinationUri: string,
  invocationFacts: unknown,
): Result.Result<Message, NavigationCarrierResolutionError> => {
  if (
    destinationUri.length === 0 ||
    destinationUri.length >
      InteractionGraph.interactionAdmissionLimits.destinationUriLength
  ) {
    return Result.fail(new InvalidNavigationCarrierUriError({ destinationUri }))
  }
  const parsedInvocationFacts = SchemaParser.decodeUnknownResult(
    InteractionGraph.InteractionInvocationFacts,
  )(invocationFacts)
  if (Result.isFailure(parsedInvocationFacts)) {
    return Result.fail(
      new InvalidNavigationCarrierInvocationFactsError({
        cause: parsedInvocationFacts.failure,
      }),
    )
  }
  const parsedTarget = Result.try({
    try: () => pathToNavigationTarget(destinationUri),
    catch: cause => resolutionDefect('ParseDestinationUri', cause),
  })
  if (Result.isFailure(parsedTarget)) {
    return Result.fail(parsedTarget.failure)
  }
  const target = parsedTarget.success
  const printedDestinationUri = Result.try({
    try: () => navigationTargetToPath(target),
    catch: cause => resolutionDefect('PrintDestinationUri', cause),
  })
  if (Result.isFailure(printedDestinationUri)) {
    return Result.fail(printedDestinationUri.failure)
  }
  const expectedDestinationUri = printedDestinationUri.success
  if (
    target._tag === 'CounterListTarget' &&
    destinationUri !== expectedDestinationUri
  ) {
    return Result.fail(new InvalidNavigationCarrierUriError({ destinationUri }))
  }
  if (destinationUri !== expectedDestinationUri) {
    return Result.fail(
      new NonCanonicalNavigationCarrierUriError({
        actualDestinationUri: destinationUri,
        expectedDestinationUri,
      }),
    )
  }
  const targetCounterId = maybeTargetCounterId(target)
  if (
    Option.isSome(targetCounterId) &&
    !Array.some(model.rows, row => row.id === targetCounterId.value)
  ) {
    return Result.fail(
      new MissingNavigationCarrierDestinationError({
        counterId: targetCounterId.value,
        destinationUri,
      }),
    )
  }
  const opening = Result.try({
    try: () =>
      openingForTarget(
        target,
        interactionIdentitySourceForOccurrence(
          parsedInvocationFacts.success.occurrenceId,
        ),
      ),
    catch: cause => resolutionDefect('ConstructOpening', cause),
  })
  if (Result.isFailure(opening)) {
    return Result.fail(opening.failure)
  }
  const candidateMessage = Result.try({
    try: () =>
      OpenedNavigation({
        opening: opening.success,
      }),
    catch: cause => resolutionDefect('ConstructMessage', cause),
  })
  if (Result.isFailure(candidateMessage)) {
    return Result.fail(candidateMessage.failure)
  }
  const encodedMessage = SchemaParser.encodeUnknownResult(Message)(
    candidateMessage.success,
  )
  if (Result.isFailure(encodedMessage)) {
    return Result.fail(
      new InvalidNavigationCarrierMessageError({
        cause: encodedMessage.failure,
      }),
    )
  }
  const parsedMessage = SchemaParser.decodeUnknownResult(Message)(
    encodedMessage.success,
  )
  if (Result.isFailure(parsedMessage)) {
    return Result.fail(
      new InvalidNavigationCarrierMessageError({
        cause: parsedMessage.failure,
      }),
    )
  } else {
    return Result.succeed(parsedMessage.success)
  }
}

/** Resolves one canonical Program URI into exactly one deterministic Message. */
export const resolveNavigationCarrier = (
  model: Model,
  destinationUri: string,
  invocationFacts: unknown,
): Result.Result<Message, NavigationCarrierResolutionError> => {
  const resolved = Result.try({
    try: () =>
      resolveNavigationCarrierResult(model, destinationUri, invocationFacts),
    catch: cause => resolutionDefect('ResolveCarrier', cause),
  })
  return Result.isFailure(resolved)
    ? Result.fail(resolved.failure)
    : resolved.success
}
