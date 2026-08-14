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
import {
  type ReactNode,
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

import type { OpenTuiCountersHost } from './instant.js'

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

const OpenTuiHostContext = createContext<OpenTuiCountersHost | null>(null)

const unusedSubscribe = (_listener: (model: Model) => void) => () => {}

const missingHostModel = (): Model => {
  throw new Error('OpenTUI Multiple Counters host is not mounted')
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

const MemoryHostBridge = ({ children }: Readonly<{ children: ReactNode }>) => {
  const model = MultipleCountersClient.useModel()
  const { sentMessage } = MultipleCountersClient.useActions()
  const modelReference = useRef(model)
  const listeners = useRef(new Set<(next: Model) => void>())
  modelReference.current = model
  useLayoutEffect(() => {
    listeners.current.forEach(listener => {
      listener(model)
    })
  }, [model])
  const host: OpenTuiCountersHost = {
    readModel: () => modelReference.current,
    send: sentMessage,
    subscribe: listener => {
      listeners.current.add(listener)
      return () => {
        listeners.current.delete(listener)
      }
    },
  }
  return (
    <OpenTuiHostContext.Provider value={host}>
      {children}
    </OpenTuiHostContext.Provider>
  )
}

const BootTarget = ({
  children,
  maybeTarget,
}: Readonly<{
  children: ReactNode
  maybeTarget: Option.Option<NavigationTarget>
}>) => {
  const host = useContext(OpenTuiHostContext)
  const replay = MultipleCountersReplay.use()
  const [maybeBootMessage] = useState(() =>
    Option.map(maybeTarget, target =>
      bootMessageForTarget(target, makeInteractionIdentitySource(randomUUID)),
    ),
  )
  const didEnqueueMessage = useRef(false)

  useLayoutEffect(() => {
    if (
      didEnqueueMessage.current ||
      Option.isNone(maybeBootMessage) ||
      host === null
    ) {
      return
    }
    didEnqueueMessage.current = true
    enqueueBootMessage(maybeBootMessage.value, host.send)
  }, [host, maybeBootMessage])

  const isBootAccepted =
    host === null ||
    host.send === undefined ||
    Option.isNone(maybeBootMessage) ||
    replay === null ||
    Array.some(replay.transitions, transition =>
      Equal.equals(transition.message, maybeBootMessage.value),
    )

  return isBootAccepted ? <>{children}</> : null
}

const MultipleCountersReplay = {
  use: (): ReturnType<typeof MultipleCountersClient.useReplay> | null =>
    useContext(OpenTuiReplayContext),
}

const OpenTuiReplayContext = createContext<ReturnType<
  typeof MultipleCountersClient.useReplay
> | null>(null)

const MemoryReplayBridge = ({
  children,
}: Readonly<{ children: ReactNode }>) => {
  const replay = MultipleCountersClient.useReplay()
  return (
    <OpenTuiReplayContext.Provider value={replay}>
      {children}
    </OpenTuiReplayContext.Provider>
  )
}

/** Provides one canonically initialized Multiple Counters runtime to OpenTUI. */
export const MultipleCountersProvider = ({
  children,
  fallback,
  host,
  maybeInitialTarget,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  host?: OpenTuiCountersHost
  maybeInitialTarget: Option.Option<NavigationTarget>
}>) => {
  if (host !== undefined) {
    return (
      <OpenTuiHostContext.Provider value={host}>
        <OpenTuiReplayContext.Provider value={null}>
          <BootTarget maybeTarget={maybeInitialTarget}>{children}</BootTarget>
        </OpenTuiReplayContext.Provider>
      </OpenTuiHostContext.Provider>
    )
  }
  return (
    <MultipleCountersClient.Provider
      fallback={fallback}
      initialRoute={initialMultipleCountersRoute}
    >
      <MemoryHostBridge>
        <MemoryReplayBridge>
          <BootTarget maybeTarget={maybeInitialTarget}>{children}</BootTarget>
        </MemoryReplayBridge>
      </MemoryHostBridge>
    </MultipleCountersClient.Provider>
  )
}

/** Reads the current immutable Multiple Counters Model. */
export const useMultipleCountersModel = (): Model => {
  const host = useContext(OpenTuiHostContext)
  return useSyncExternalStore(
    host === null ? unusedSubscribe : host.subscribe,
    host === null ? missingHostModel : host.readModel,
    host === null ? missingHostModel : host.readModel,
  )
}

/** Returns stable OpenTUI-callable Multiple Counters actions. */
export const useMultipleCountersActions = (): MultipleCountersActions => {
  const host = useContext(OpenTuiHostContext)
  if (host === null) {
    throw new Error('OpenTUI Multiple Counters host is not mounted')
  }
  return { sentMessage: host.send }
}

/** Returns controls for inspecting and branching the OpenTUI tape. */
export const useMultipleCountersReplay = () => {
  const replay = useContext(OpenTuiReplayContext)
  if (replay === null) {
    return {
      mode: 'Live',
      frame: 0,
      finalFrame: 0,
      isBranchable: true,
      maybeError: Option.none<string>(),
      runtimeEvents: [],
      occurredRuntimeEvents: [],
      transitions: [],
      inspect: () => {},
      resume: () => {},
      seek: () => {},
      stepBackward: () => {},
      stepForward: () => {},
      stateRoute: () => {
        throw new Error('Instant tape has no local replay route')
      },
      replayRoute: () => {
        throw new Error('Instant tape has no local replay route')
      },
      statePath: async () => '/counters',
      replayPath: async () => '/counters',
    }
  }
  return replay
}
