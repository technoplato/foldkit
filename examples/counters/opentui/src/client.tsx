import {
  type InteractionIdentitySource,
  type Message,
  type Model,
  MultipleCountersProgram,
  type NavigationTarget,
  OpenedNavigation,
  StaticCounterFactClient,
  makeInteractionIdentitySource,
  openingForTarget,
} from 'counters-core-example'
import { Array, Equal, Option } from 'effect'
import { Program } from 'foldkit'
import { randomUUID } from 'node:crypto'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

/** Actions exposed by the OpenTUI Multiple Counters Client. */
export type MultipleCountersActions = Readonly<{
  sentMessage: (message: Message) => void
}>

/** One portable state or replay route accepted by the OpenTUI Client. */
export type MultipleCountersInitialRoute = Program.ResolvedProgramRoute<
  Model,
  Message
>

const [initialMultipleCountersModel] = MultipleCountersProgram.init()

/** The canonical fresh Multiple Counters route used by OpenTUI. */
export const initialMultipleCountersRoute: MultipleCountersInitialRoute =
  Program.state(initialMultipleCountersModel)

/** Builds the Program-owned Message used to open one external navigation target. */
export const bootMessageForTarget = (
  target: NavigationTarget,
  identitySource: InteractionIdentitySource,
): Message =>
  OpenedNavigation({
    opening: openingForTarget(target, identitySource),
  })

/** Enqueues one prepared boot Message through the same path as later host input. */
export const enqueueBootMessage = (
  message: Message,
  sendMessage: MultipleCountersActions['sentMessage'],
): void => {
  sendMessage(message)
}

const MultipleCountersClient = createReplayableReactProgramClient<
  Model,
  Message,
  MultipleCountersActions,
  MultipleCountersInitialRoute,
  import('counters-core-example').CounterFactClient
>({
  createActions: enqueueMessage => ({ sentMessage: enqueueMessage }),
  name: 'MultipleCountersOpenTui',
  program: MultipleCountersProgram,
  resources: StaticCounterFactClient,
  route: initialRoute => initialRoute,
})

const BootTarget = ({
  children,
  maybeTarget,
}: Readonly<{
  children: ReactNode
  maybeTarget: Option.Option<NavigationTarget>
}>) => {
  const actions = MultipleCountersClient.useActions()
  const replay = MultipleCountersClient.useReplay()
  const [maybeBootMessage] = useState(() =>
    Option.map(maybeTarget, target =>
      bootMessageForTarget(target, makeInteractionIdentitySource(randomUUID)),
    ),
  )
  const didEnqueueMessage = useRef(false)

  useLayoutEffect(() => {
    if (didEnqueueMessage.current || Option.isNone(maybeBootMessage)) {
      return
    }
    didEnqueueMessage.current = true
    enqueueBootMessage(maybeBootMessage.value, actions.sentMessage)
  }, [actions.sentMessage, maybeBootMessage])

  const isBootAccepted =
    Option.isNone(maybeBootMessage) ||
    Array.some(replay.transitions, transition =>
      Equal.equals(transition.message, maybeBootMessage.value),
    )

  return isBootAccepted ? <>{children}</> : null
}

/** Provides one canonically initialized Multiple Counters runtime to OpenTUI. */
export const MultipleCountersProvider = ({
  children,
  fallback,
  maybeInitialTarget,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  maybeInitialTarget: Option.Option<NavigationTarget>
}>) => (
  <MultipleCountersClient.Provider
    fallback={fallback}
    initialRoute={initialMultipleCountersRoute}
  >
    <BootTarget maybeTarget={maybeInitialTarget}>{children}</BootTarget>
  </MultipleCountersClient.Provider>
)

/** Reads the current immutable Multiple Counters Model. */
export const useMultipleCountersModel = MultipleCountersClient.useModel

/** Returns stable OpenTUI-callable Multiple Counters actions. */
export const useMultipleCountersActions = MultipleCountersClient.useActions

/** Returns controls for inspecting and branching the OpenTUI tape. */
export const useMultipleCountersReplay = MultipleCountersClient.useReplay
