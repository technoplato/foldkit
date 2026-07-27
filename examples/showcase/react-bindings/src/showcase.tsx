import { Layer } from 'effect'
import * as Program from 'foldkit/program'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'
import {
  type Message,
  type Model,
  type Navigation,
  OpenedNavigation,
  ShowcaseProgram,
  TappedBackButton,
  TappedCalculatorButton,
  TappedCounterButton,
  TappedFactButton,
  TappedMultipleCountersButton,
  TappedWalletButton,
  initialModel,
} from 'showcase-core-example'

/** Actions exposed to React consumers of showcase navigation. */
export type ShowcaseActions = Readonly<{
  tappedBackButton: () => void
  tappedCalculatorButton: () => void
  tappedCounterButton: () => void
  tappedFactButton: () => void
  tappedMultipleCountersButton: () => void
  tappedWalletButton: () => void
  openedNavigation: (navigation: Navigation) => void
}>

/** One portable state or replay route accepted by the showcase client. */
export type ShowcaseInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** The canonical fresh showcase navigation route. */
export const initialShowcaseRoute: ShowcaseInitialRoute =
  Program.state(initialModel)

/** The canonical React and React Native showcase navigation client. */
export const ShowcaseClient = createReplayableReactProgramClient<
  Model,
  Message,
  ShowcaseActions,
  ShowcaseInitialRoute
>({
  createActions: enqueueMessage => ({
    tappedBackButton: () => enqueueMessage(TappedBackButton()),
    tappedCalculatorButton: () => enqueueMessage(TappedCalculatorButton()),
    tappedCounterButton: () => enqueueMessage(TappedCounterButton()),
    tappedFactButton: () => enqueueMessage(TappedFactButton()),
    tappedMultipleCountersButton: () =>
      enqueueMessage(TappedMultipleCountersButton()),
    tappedWalletButton: () => enqueueMessage(TappedWalletButton()),
    openedNavigation: navigation =>
      enqueueMessage(OpenedNavigation({ navigation })),
  }),
  name: 'ShowcaseNavigation',
  program: ShowcaseProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

/** Provides one showcase navigation runtime to React children. */
export const ShowcaseProvider = ({
  children,
  fallback,
  initialRoute = initialShowcaseRoute,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  initialRoute?: ShowcaseInitialRoute
}>) => (
  <ShowcaseClient.Provider initialRoute={initialRoute} fallback={fallback}>
    {children}
  </ShowcaseClient.Provider>
)

/** Reads the current showcase navigation Model. */
export const useShowcaseModel = ShowcaseClient.useModel

/** Returns stable host-callable showcase navigation actions. */
export const useShowcaseActions = ShowcaseClient.useActions

/** Returns inert inspection and live branching controls for navigation. */
export const useShowcaseReplay = ShowcaseClient.useReplay
