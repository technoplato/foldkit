import {
  type CounterDetailMode,
  type CounterFactStatus,
  type Interaction,
  type Model,
  MultipleCountersInteractionGraph,
  destinationForModel,
  interactionMessageCategory,
} from 'counters-core-example'
import { Array, Match as M, Option, Result } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'

type MultipleCountersAction = InteractionGraph.InteractionAction<Interaction>

/** One projected Program action a Client may present. */
export type MultipleCountersV3ProgramAction = Readonly<{
  isEnabled: boolean
  isNavigation: boolean
  label: string
  token: string
}>

const projectedActions = (
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

/** Projects valid Program actions and gates navigation for Observe followers. */
export const multipleCountersV3ProgramActions = (
  model: Model,
  isNavigationEnabled: boolean,
): Result.Result<
  ReadonlyArray<MultipleCountersV3ProgramAction>,
  InteractionGraph.InteractionGraphError
> =>
  Result.map(projectedActions(model), actions =>
    Array.map(actions, action => {
      const isNavigation =
        interactionMessageCategory(action.descriptor) === 'Navigation'
      return {
        isEnabled:
          action.availability._tag === 'Available' &&
          (!isNavigation || isNavigationEnabled),
        isNavigation,
        label: action.label,
        token: action.descriptor.token,
      }
    }),
  )

/** Finds one projected action by its presentation token. */
export const multipleCountersV3ProgramActionForToken = (
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>,
  token: string,
): Option.Option<MultipleCountersV3ProgramAction> =>
  Array.findFirst(actions, action => action.token === token)

const followSuffix = (action: MultipleCountersV3ProgramAction): string =>
  action.isEnabled ? '' : '  (follows the leader)'

/** Formats currently valid Program actions for CLI hosts. */
export const formatMultipleCountersV3AvailableActions = (
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>,
): ReadonlyArray<string> =>
  Array.map(
    actions,
    action => `${action.token}  ${action.label}${followSuffix(action)}`,
  )

/** Formats currently valid Program actions as a numbered TUI list. */
export const formatMultipleCountersV3NumberedActions = (
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>,
): ReadonlyArray<string> =>
  Array.map(
    actions,
    (action, index) =>
      `  [${(index + 1).toString()}] ${action.label}  ${action.token}${followSuffix(action)}`,
  )

const formatFactStatus = (
  status: CounterFactStatus,
): ReadonlyArray<string> =>
  M.value(status).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      LoadingCounterFact: () => ['Loading counter fact…'],
      LoadedCounterFact: ({ fact }) => [
        `Counter fact for ${fact.number.toString()}`,
        fact.text,
      ],
      FailedCounterFact: ({ reason }) => ['Counter fact unavailable', reason],
    }),
  )

const formatDetailMode = (
  counterId: string,
  mode: CounterDetailMode,
): ReadonlyArray<string> =>
  M.value(mode).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) => formatFactStatus(status),
      DeleteCounterConfirmation: () => [
        `Delete ${counterId}?`,
        'This cannot be undone.',
      ],
    }),
  )

/** Formats the current Multiple Counters destination for CLI, TUI, and tests. */
export const formatMultipleCountersV3Destination = (
  model: Model,
): ReadonlyArray<string> =>
  M.value(destinationForModel(model)).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => [
        'Counters',
        ...Array.map(
          counters,
          counter => `${counter.id}: ${counter.counter.count.toString()}`,
        ),
      ],
      CounterDetailDestination: ({ counter, maybeMode }) => {
        if (Option.isSome(maybeMode)) {
          return formatDetailMode(counter.id, maybeMode.value)
        }
        return [counter.id, `Count: ${counter.counter.count.toString()}`]
      },
    }),
  )
