import {
  type Interaction,
  type Message,
  type Model,
  MultipleCountersInteractionGraph,
  MultipleCountersProgram,
  type Navigation,
  type NavigationCarrierResolutionError,
  StaticCounterFactClient,
  activatedInteraction,
  interactionIdentitySourceForOccurrence,
  navigationToPath,
  resolveNavigationCarrier,
} from 'counters-core-example'
import { Array, Data, Equal, Option, Result } from 'effect'
import { InteractionGraph, Program } from 'foldkit'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

type MultipleCountersRuntimeActions = Readonly<{
  sentMessage: (message: Message) => void
}>

/** One exact Program-owned action projected for a React Client. */
export type MultipleCountersAction =
  InteractionGraph.InteractionAction<Interaction>

/** A named React action was absent from the current semantic graph. */
export class MissingMultipleCountersClientActionError extends Data.TaggedError(
  'MissingMultipleCountersClientActionError',
)<Readonly<{ action: string }>> {}

/** Every typed failure surfaced by Multiple Counters React actions. */
export type MultipleCountersClientResolutionError =
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | MissingMultipleCountersClientActionError
  | NavigationCarrierResolutionError

/** The typed result of one React Client action attempt. */
export type MultipleCountersActionResult = Result.Result<
  void,
  MultipleCountersClientResolutionError
>

/** Actions exposed to React consumers of the Multiple Counters Program. */
export type MultipleCountersActions = Readonly<{
  cancelledDeleteCounter: () => MultipleCountersActionResult
  clickedAddCounter: () => MultipleCountersActionResult
  clickedDecrementCounter: (counterId: string) => MultipleCountersActionResult
  clickedDeleteCounter: () => MultipleCountersActionResult
  clickedIncrementCounter: (counterId: string) => MultipleCountersActionResult
  clickedResetCounter: (counterId: string) => MultipleCountersActionResult
  clickedShowCounterFact: () => MultipleCountersActionResult
  confirmedDeleteCounter: () => MultipleCountersActionResult
  dismissedCounterDetail: () => MultipleCountersActionResult
  dismissedCounterFactAlert: () => MultipleCountersActionResult
  openedNavigation: (
    carrier: string | Navigation,
  ) => MultipleCountersActionResult
  performed: (action: MultipleCountersAction) => MultipleCountersActionResult
  selectedCounter: (counterId: string) => MultipleCountersActionResult
}>

/** One portable state or replay route accepted by the Multiple Counters client. */
export type MultipleCountersInitialRoute = Program.ResolvedProgramRoute<
  Model,
  Message
>

const [initialMultipleCountersModel] = MultipleCountersProgram.init()

/** The canonical fresh Multiple Counters route shared by host carriers. */
export const initialMultipleCountersRoute: MultipleCountersInitialRoute =
  Program.state(initialMultipleCountersModel)

const nextOccurrenceId = (): InteractionGraph.InteractionOccurrenceId => {
  const crypto = globalThis.crypto
  if (crypto === undefined) {
    return `react:${Date.now().toString(36)}_${Math.floor(
      Math.random() * Number.MAX_SAFE_INTEGER,
    ).toString(36)}`
  } else {
    return `react:${crypto.randomUUID()}`
  }
}

const invocationFacts = (
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
): InteractionGraph.InteractionInvocationFacts =>
  InteractionGraph.InteractionInvocationFacts.make({
    actorId: 'react-local-actor',
    clientId: 'react-local-client',
    occurrenceId,
    originatingProcessorId: 'react-local-processor',
    sessionId: 'react-local-session',
    subjectId: 'react-local-subject',
  })

const destinationUriForCarrier = (carrier: string | Navigation): string =>
  typeof carrier === 'string' ? carrier : navigationToPath(carrier)

/** Resolves one raw React carrier through the strict Program-owned boundary. */
export const resolveMultipleCountersNavigation = (
  model: Model,
  carrier: string | Navigation,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
) =>
  resolveNavigationCarrier(
    model,
    destinationUriForCarrier(carrier),
    invocationFacts(occurrenceId),
  )

/** Resolves one exact projected React action against the supplied Model. */
export const resolveMultipleCountersAction = (
  model: Model,
  action: MultipleCountersAction,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
) =>
  MultipleCountersInteractionGraph.resolveWithContext(
    model,
    activatedInteraction(action.reference, occurrenceId),
    interactionIdentitySourceForOccurrence(occurrenceId),
  )

const resolveBootMessage = (carrier: string) =>
  resolveMultipleCountersNavigation(
    initialMultipleCountersModel,
    carrier,
    nextOccurrenceId(),
  )

const MultipleCountersRuntimeClient = createReplayableReactProgramClient<
  Model,
  Message,
  MultipleCountersRuntimeActions,
  MultipleCountersInitialRoute,
  import('counters-core-example').CounterFactClient
>({
  createActions: sentMessage => ({ sentMessage }),
  name: 'MultipleCounters',
  program: MultipleCountersProgram,
  resources: StaticCounterFactClient,
  route: initialRoute => initialRoute,
})

type MultipleCountersResolutionContextValue = Readonly<{
  clearResolutionError: () => void
  maybeResolutionError: Option.Option<MultipleCountersClientResolutionError>
  reportResolutionError: (error: MultipleCountersClientResolutionError) => void
}>

const defaultResolutionContext: MultipleCountersResolutionContextValue = {
  clearResolutionError: () => {},
  maybeResolutionError: Option.none(),
  reportResolutionError: () => {},
}

const MultipleCountersResolutionContext =
  createContext<MultipleCountersResolutionContextValue>(
    defaultResolutionContext,
  )

const MultipleCountersResolutionProvider = ({
  children,
}: Readonly<{ children: ReactNode }>) => {
  const [maybeResolutionError, setResolutionError] = useState(
    Option.none<MultipleCountersClientResolutionError>(),
  )
  const clearResolutionError = useCallback(
    () => setResolutionError(Option.none()),
    [],
  )
  const reportResolutionError = useCallback(
    (error: MultipleCountersClientResolutionError) =>
      setResolutionError(Option.some(error)),
    [],
  )
  const value = useMemo<MultipleCountersResolutionContextValue>(
    () => ({
      clearResolutionError,
      maybeResolutionError,
      reportResolutionError,
    }),
    [clearResolutionError, maybeResolutionError, reportResolutionError],
  )
  return (
    <MultipleCountersResolutionContext.Provider value={value}>
      {children}
    </MultipleCountersResolutionContext.Provider>
  )
}

const useResolvedMultipleCountersActions = (): MultipleCountersActions => {
  const model = MultipleCountersRuntimeClient.useModel()
  const modelReference = useRef(model)
  useLayoutEffect(() => {
    modelReference.current = model
  }, [model])
  const { sentMessage } = MultipleCountersRuntimeClient.useActions()
  const { clearResolutionError, reportResolutionError } = useContext(
    MultipleCountersResolutionContext,
  )

  const failed = useCallback(
    (
      error: MultipleCountersClientResolutionError,
    ): MultipleCountersActionResult => {
      reportResolutionError(error)
      return Result.fail(error)
    },
    [reportResolutionError],
  )

  const sendResolved = useCallback(
    (
      resolved: Result.Result<Message, MultipleCountersClientResolutionError>,
    ): MultipleCountersActionResult => {
      if (Result.isFailure(resolved)) {
        return failed(resolved.failure)
      }
      clearResolutionError()
      sentMessage(resolved.success)
      return Result.succeed(undefined)
    },
    [clearResolutionError, failed, sentMessage],
  )

  const performed = useCallback(
    (action: MultipleCountersAction): MultipleCountersActionResult =>
      sendResolved(
        resolveMultipleCountersAction(
          modelReference.current,
          action,
          nextOccurrenceId(),
        ),
      ),
    [sendResolved],
  )

  const performFirst = useCallback(
    (
      actionName: string,
      predicate: (interaction: Interaction) => boolean,
    ): MultipleCountersActionResult => {
      const projected = MultipleCountersInteractionGraph.project(
        modelReference.current,
      )
      if (Result.isFailure(projected)) {
        return failed(projected.failure)
      }
      const maybeAction = Array.findFirst(
        InteractionGraph.interactiveNodes(projected.success.root),
        (node): node is MultipleCountersAction =>
          node._tag === 'InteractionAction' && predicate(node.descriptor),
      )
      if (Option.isNone(maybeAction)) {
        return failed(
          new MissingMultipleCountersClientActionError({
            action: actionName,
          }),
        )
      }
      return performed(maybeAction.value)
    },
    [failed, performed],
  )

  const openedNavigation = useCallback(
    (carrier: string | Navigation): MultipleCountersActionResult =>
      sendResolved(
        resolveMultipleCountersNavigation(
          modelReference.current,
          carrier,
          nextOccurrenceId(),
        ),
      ),
    [sendResolved],
  )

  return useMemo(
    () => ({
      cancelledDeleteCounter: () =>
        performFirst(
          'CancelDeleteCounter',
          interaction => interaction.token === 'cancel',
        ),
      clickedAddCounter: () =>
        performFirst('AddCounter', interaction => interaction.token === 'add'),
      clickedDecrementCounter: counterId =>
        performFirst(
          `DecrementCounter:${counterId}`,
          interaction => interaction.token === `decrement:${counterId}`,
        ),
      clickedDeleteCounter: () =>
        performFirst(
          'DeleteCounter',
          interaction => interaction.token === 'delete',
        ),
      clickedIncrementCounter: counterId =>
        performFirst(
          `IncrementCounter:${counterId}`,
          interaction => interaction.token === `increment:${counterId}`,
        ),
      clickedResetCounter: counterId =>
        performFirst(
          `ResetCounter:${counterId}`,
          interaction =>
            interaction.token === 'reset' &&
            interaction.anchor._tag === 'CounterDetailAnchor' &&
            interaction.anchor.counterId === counterId,
        ),
      clickedShowCounterFact: () =>
        performFirst(
          'ShowCounterFact',
          interaction => interaction.token === 'fact',
        ),
      confirmedDeleteCounter: () =>
        performFirst(
          'ConfirmDeleteCounter',
          interaction => interaction.token === 'confirm-delete',
        ),
      dismissedCounterDetail: () =>
        performFirst(
          'DismissCounterDetail',
          interaction => interaction.token === 'back',
        ),
      dismissedCounterFactAlert: () =>
        performFirst(
          'DismissCounterFactAlert',
          interaction => interaction.token === 'dismiss',
        ),
      openedNavigation,
      performed,
      selectedCounter: counterId =>
        performFirst(
          `OpenCounter:${counterId}`,
          interaction => interaction.token === `open:${counterId}`,
        ),
    }),
    [openedNavigation, performFirst, performed],
  )
}

const BootNavigation = ({
  children,
  initialDestinationUri,
}: Readonly<{
  children: ReactNode
  initialDestinationUri: string
}>) => {
  const { sentMessage } = MultipleCountersRuntimeClient.useActions()
  const replay = MultipleCountersRuntimeClient.useReplay()
  const { clearResolutionError, reportResolutionError } = useContext(
    MultipleCountersResolutionContext,
  )
  const [bootResolution] = useState(() =>
    resolveBootMessage(initialDestinationUri),
  )
  const [isBootHandled, setIsBootHandled] = useState(false)
  const didEnqueueMessage = useRef(false)

  useLayoutEffect(() => {
    if (didEnqueueMessage.current) {
      return
    }
    didEnqueueMessage.current = true
    if (Result.isFailure(bootResolution)) {
      reportResolutionError(bootResolution.failure)
    } else {
      clearResolutionError()
      sentMessage(bootResolution.success)
    }
    setIsBootHandled(true)
  }, [bootResolution, clearResolutionError, reportResolutionError, sentMessage])

  const isBootAccepted =
    isBootHandled &&
    (Result.isFailure(bootResolution) ||
      Array.some(replay.transitions, transition =>
        Equal.equals(transition.message, bootResolution.success),
      ))
  return isBootAccepted ? <>{children}</> : null
}

/** Provides one canonically initialized, URL-opened Multiple Counters runtime. */
export const MultipleCountersProvider = ({
  children,
  fallback,
  initialDestinationUri,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  initialDestinationUri: string
}>) => (
  <MultipleCountersRuntimeClient.Provider
    initialRoute={initialMultipleCountersRoute}
    fallback={fallback}
  >
    <MultipleCountersResolutionProvider>
      <BootNavigation initialDestinationUri={initialDestinationUri}>
        {children}
      </BootNavigation>
    </MultipleCountersResolutionProvider>
  </MultipleCountersRuntimeClient.Provider>
)

/** Provides an explicit state or replay route for inspection-oriented hosts. */
export const MultipleCountersProgramRouteProvider = ({
  children,
  fallback,
  initialRoute,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  initialRoute: MultipleCountersInitialRoute
}>) => (
  <MultipleCountersRuntimeClient.Provider
    initialRoute={initialRoute}
    fallback={fallback}
  >
    <MultipleCountersResolutionProvider>
      {children}
    </MultipleCountersResolutionProvider>
  </MultipleCountersRuntimeClient.Provider>
)

/** The canonical React and React Native client for Multiple Counters. */
export const MultipleCountersClient = {
  ...MultipleCountersRuntimeClient,
  Provider: MultipleCountersProvider,
  useActions: useResolvedMultipleCountersActions,
}

/** An inspection Client for explicit Program state and replay routes. */
export const MultipleCountersProgramRouteClient = {
  Provider: MultipleCountersProgramRouteProvider,
  useActions: useResolvedMultipleCountersActions,
  useModel: MultipleCountersRuntimeClient.useModel,
  useReplay: MultipleCountersRuntimeClient.useReplay,
}

/** Reads the current immutable Multiple Counters Model. */
export const useMultipleCountersModel = MultipleCountersRuntimeClient.useModel

/** Returns stable host-callable Multiple Counters actions. */
export const useMultipleCountersActions = useResolvedMultipleCountersActions

/** Reads the latest typed Client-local navigation or interaction failure. */
export const useMultipleCountersResolutionError = () =>
  useContext(MultipleCountersResolutionContext).maybeResolutionError

/** Returns controls for inspecting and branching the same Multiple Counters tape. */
export const useMultipleCountersReplay = MultipleCountersRuntimeClient.useReplay
