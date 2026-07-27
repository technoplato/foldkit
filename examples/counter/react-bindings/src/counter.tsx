import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  CounterProgram,
  Message,
  Model,
  initialCount,
} from 'counter-core-example'
import { Layer } from 'effect'
import { Program } from 'foldkit'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

/** Actions exposed to React and React Native consumers of the Counter Program. */
export type CounterActions = Readonly<{
  clickedDecrement: () => void
  clickedIncrement: () => void
  clickedReset: () => void
}>

/** One portable state or replay route accepted by the Counter client. */
export type CounterInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** The canonical fresh Counter route shared by host carriers. */
export const initialCounterRoute: CounterInitialRoute = Program.state(
  Model.make({ count: initialCount }),
)

/** The canonical React and React Native client for the Counter Program. */
export const CounterClient = createReplayableReactProgramClient<
  Model,
  Message,
  CounterActions,
  CounterInitialRoute
>({
  createActions: enqueueMessage => ({
    clickedDecrement: () => enqueueMessage(ClickedDecrement()),
    clickedIncrement: () => enqueueMessage(ClickedIncrement()),
    clickedReset: () => enqueueMessage(ClickedReset()),
  }),
  name: 'Counter',
  program: CounterProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

/** Provides one Counter runtime to React or React Native children. */
export const CounterProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <CounterClient.Provider
    initialRoute={initialCounterRoute}
    fallback={fallback}
  >
    {children}
  </CounterClient.Provider>
)

/** Reads the current immutable Counter Model and re-renders on Model changes. */
export const useCounterModel = CounterClient.useModel

/** Returns stable, host-callable Counter actions. */
export const useCounterActions = CounterClient.useActions

/** Returns inert inspection and live branching controls for the Counter tape. */
export const useCounterReplay = CounterClient.useReplay
