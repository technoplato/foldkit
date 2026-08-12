import {
  type Interaction,
  type Model,
  MultipleCountersInteractionGraph,
} from 'counters-core-example'
import { Array, Data, Option, Result } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'

import {
  multipleCountersV3ProgramActionForToken,
  multipleCountersV3ProgramActions,
} from './programView.js'

/** A CLI or TUI token is not valid in the current Program state. */
export class MultipleCountersV3ActionTokenError extends Data.TaggedError(
  'MultipleCountersV3ActionTokenError',
)<Readonly<{ message: string }>> {}

/** An Observe follower cannot invoke navigation; it follows the leader. */
export class MultipleCountersV3NavigationFollowsLeaderError extends Data.TaggedError(
  'MultipleCountersV3NavigationFollowsLeaderError',
)<Readonly<{ message: string }>> {}

type MultipleCountersAction = InteractionGraph.InteractionAction<Interaction>

const actionsForModel = (
  model: Model,
): Result.Result<
  ReadonlyArray<MultipleCountersAction>,
  InteractionGraph.InteractionGraphError
> =>
  Result.map(MultipleCountersInteractionGraph.project(model), projection =>
    Array.filter(
      InteractionGraph.interactiveNodes(projection.root),
      (node): node is MultipleCountersAction =>
        node._tag === 'InteractionAction',
    ),
  )

/** Resolves one state-dependent action token to a Program interaction reference. */
export const resolveMultipleCountersV3ActionToken = (
  model: Model,
  token: string,
): Result.Result<
  InteractionGraph.InteractionReference,
  MultipleCountersV3ActionTokenError | InteractionGraph.InteractionGraphError
> => {
  const projected = actionsForModel(model)
  if (Result.isFailure(projected)) {
    return Result.fail(projected.failure)
  }
  const maybeAction = Array.findFirst(
    projected.success,
    action => action.descriptor.token === token,
  )
  if (Option.isNone(maybeAction)) {
    const tokens = Array.map(
      projected.success,
      action => action.descriptor.token,
    )
    return Result.fail(
      new MultipleCountersV3ActionTokenError({
        message: `Action "${token}" is not valid here. Valid actions: ${Array.join(tokens, ', ')}`,
      }),
    )
  }
  return Result.succeed(maybeAction.value.reference)
}

/** Resolves a token only when it is valid and enabled for this Processor. */
export const resolveMultipleCountersV3EnabledActionToken = (
  model: Model,
  token: string,
  isNavigationEnabled: boolean,
): Result.Result<
  InteractionGraph.InteractionReference,
  | MultipleCountersV3ActionTokenError
  | MultipleCountersV3NavigationFollowsLeaderError
  | InteractionGraph.InteractionGraphError
> => {
  const projected = multipleCountersV3ProgramActions(
    model,
    isNavigationEnabled,
  )
  if (Result.isFailure(projected)) {
    return Result.fail(projected.failure)
  }
  const maybeAction = multipleCountersV3ProgramActionForToken(
    projected.success,
    token,
  )
  if (Option.isNone(maybeAction)) {
    return resolveMultipleCountersV3ActionToken(model, token)
  }
  if (!maybeAction.value.isEnabled) {
    return Result.fail(
      new MultipleCountersV3NavigationFollowsLeaderError({
        message: `Action "${token}" is navigation and this Processor follows the leader.`,
      }),
    )
  }
  return resolveMultipleCountersV3ActionToken(model, token)
}

/** Tokens currently valid for the supplied Model. */
export const multipleCountersV3ActionTokens = (
  model: Model,
): Result.Result<
  ReadonlyArray<string>,
  InteractionGraph.InteractionGraphError
> =>
  Result.map(actionsForModel(model), actions =>
    Array.map(actions, action => action.descriptor.token),
  )
