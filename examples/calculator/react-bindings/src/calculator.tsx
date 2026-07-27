import {
  CalculatorProgram,
  type Digit,
  Message,
  Model,
  type Operation,
  PressedBackspace,
  PressedClear,
  PressedDecimalSeparator,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  PressedPercent,
  PressedSign,
  initialModel,
} from 'calculator-core-example'
import { Layer } from 'effect'
import { Program } from 'foldkit'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

/** Actions exposed to React consumers of the Calculator Program. */
export type CalculatorActions = Readonly<{
  pressedBackspace: () => void
  pressedClear: () => void
  pressedDecimalSeparator: () => void
  pressedDigit: (digit: Digit) => void
  pressedEquals: () => void
  pressedOperation: (operation: Operation) => void
  pressedPercent: () => void
  pressedSign: () => void
}>

/** One portable state or replay route accepted by the Calculator client. */
export type CalculatorInitialRoute = Program.ResolvedProgramRoute<
  Model,
  Message
>

/** The canonical fresh Calculator route shared by host carriers. */
export const initialCalculatorRoute: CalculatorInitialRoute =
  Program.state(initialModel)

/** The canonical React client for the Calculator Program. */
export const CalculatorClient = createReplayableReactProgramClient<
  Model,
  Message,
  CalculatorActions,
  CalculatorInitialRoute
>({
  createActions: enqueueMessage => ({
    pressedBackspace: () => enqueueMessage(PressedBackspace()),
    pressedClear: () => enqueueMessage(PressedClear()),
    pressedDecimalSeparator: () => enqueueMessage(PressedDecimalSeparator()),
    pressedDigit: digit => enqueueMessage(PressedDigit({ digit })),
    pressedEquals: () => enqueueMessage(PressedEquals()),
    pressedOperation: operation =>
      enqueueMessage(PressedOperation({ operation })),
    pressedPercent: () => enqueueMessage(PressedPercent()),
    pressedSign: () => enqueueMessage(PressedSign()),
  }),
  name: 'Calculator',
  program: CalculatorProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

/** Provides one Calculator runtime to React children. */
export const CalculatorProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <CalculatorClient.Provider
    initialRoute={initialCalculatorRoute}
    fallback={fallback}
  >
    {children}
  </CalculatorClient.Provider>
)

/** Reads the current immutable Calculator Model and re-renders on Model changes. */
export const useCalculatorModel = CalculatorClient.useModel

/** Returns stable, host-callable Calculator actions. */
export const useCalculatorActions = CalculatorClient.useActions

/** Returns inert inspection and live branching controls for the Calculator tape. */
export const useCalculatorReplay = CalculatorClient.useReplay
