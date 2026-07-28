import {
  type AccessibilityProfile,
  AdvancedCardboardSequence,
  CardboardProgram,
  CompletedZeroGame,
  type InputMethod,
  type Message,
  type Model,
  OpenedConversationLedger,
  PressedLowercaseG,
  PressedSpace,
  PressedZeroButton,
  ReleasedZeroButton,
  ReturnedToRuleZeroPage,
  ReturnedToZeroStart,
  SelectedAccessibilityProfile,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  SkippedZeroStep,
  ToggledRgbInversion,
  initialCardboardRoute,
} from 'cardboard-core-example'
import { Layer } from 'effect'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

/** Host-sendable Cardboard actions. Internal lifecycle ticks remain private. */
export type CardboardActions = Readonly<{
  advancedCardboardSequence: () => void
  completedZeroGame: () => void
  openedConversationLedger: () => void
  pressedLowercaseG: () => void
  pressedSpace: () => void
  pressedZeroButton: () => void
  releasedZeroButton: () => void
  returnedToZeroStart: () => void
  returnedToRuleZeroPage: () => void
  selectedAccessibilityProfile: (profile: AccessibilityProfile) => void
  selectedInputMethod: (inputMethod: InputMethod) => void
  skippedZeroStep: () => void
  toggledRgbInversion: () => void
}>

/** One portable Cardboard state or replay route. */
export type CardboardInitialRoute = typeof initialCardboardRoute

/** React and React Native bindings over the renderer-neutral Cardboard Program. */
export const CardboardClient = createReplayableReactProgramClient<
  Model,
  Message,
  CardboardActions,
  CardboardInitialRoute
>({
  createActions: enqueueMessage => ({
    advancedCardboardSequence: () =>
      enqueueMessage(AdvancedCardboardSequence()),
    completedZeroGame: () => enqueueMessage(CompletedZeroGame()),
    openedConversationLedger: () => enqueueMessage(OpenedConversationLedger()),
    pressedLowercaseG: () => enqueueMessage(PressedLowercaseG()),
    pressedSpace: () => enqueueMessage(PressedSpace()),
    pressedZeroButton: () => enqueueMessage(PressedZeroButton()),
    releasedZeroButton: () => enqueueMessage(ReleasedZeroButton()),
    returnedToZeroStart: () => enqueueMessage(ReturnedToZeroStart()),
    returnedToRuleZeroPage: () => enqueueMessage(ReturnedToRuleZeroPage()),
    selectedAccessibilityProfile: profile =>
      enqueueMessage(SelectedAccessibilityProfile({ profile })),
    selectedInputMethod: inputMethod => {
      if (inputMethod === 'Mirror') {
        enqueueMessage(SelectedMirrorAnswer())
      } else {
        enqueueMessage(SelectedIncorrectInputMethod({ inputMethod }))
      }
    },
    skippedZeroStep: () => enqueueMessage(SkippedZeroStep()),
    toggledRgbInversion: () => enqueueMessage(ToggledRgbInversion()),
  }),
  name: 'Cardboard',
  program: CardboardProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

/** Provides one Cardboard runtime to React or React Native children. */
export const CardboardProvider = ({
  children,
  fallback,
  initialRoute = initialCardboardRoute,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  initialRoute?: CardboardInitialRoute
}>) => (
  <CardboardClient.Provider initialRoute={initialRoute} fallback={fallback}>
    {children}
  </CardboardClient.Provider>
)

/** Reads the current immutable Cardboard Model. */
export const useCardboardModel = CardboardClient.useModel

/** Returns stable host-callable Cardboard actions. */
export const useCardboardActions = CardboardClient.useActions

/** Returns inert inspection and live branching controls for Cardboard replay. */
export const useCardboardReplay = CardboardClient.useReplay
