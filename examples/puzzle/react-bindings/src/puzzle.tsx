import { Layer } from 'effect'
import { Program } from 'foldkit'
import {
  GuessedNo,
  GuessedYes,
  Message,
  Model,
  PuzzleProgram,
  ResetTape,
  demoModel,
} from 'puzzle-core-example'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

export { GuessedNo, GuessedYes, ResetTape }

/** Pointer causes. Each cause sends a semantic Message. */
export type PuzzleActions = Readonly<{
  clickedGuessedNo: () => void
  clickedGuessedYes: () => void
  clickedResetTape: () => void
}>

/** One portable state or replay route accepted by the Puzzle client. */
export type PuzzleInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** The canonical fresh Puzzle route shared by host carriers. */
export const initialPuzzleRoute: PuzzleInitialRoute = Program.state(demoModel())

/** The canonical React and React Native client for the Puzzle Program. */
export const PuzzleClient = createReplayableReactProgramClient<
  Model,
  Message,
  PuzzleActions,
  PuzzleInitialRoute
>({
  createActions: enqueueMessage => ({
    clickedGuessedNo: () => enqueueMessage(GuessedNo()),
    clickedGuessedYes: () => enqueueMessage(GuessedYes()),
    clickedResetTape: () => enqueueMessage(ResetTape()),
  }),
  name: 'Puzzle',
  program: PuzzleProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

/** Provides one Puzzle runtime to React or React Native children. */
export const PuzzleProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <PuzzleClient.Provider initialRoute={initialPuzzleRoute} fallback={fallback}>
    {children}
  </PuzzleClient.Provider>
)

/** Reads the current immutable Puzzle Model and re-renders on Model changes. */
export const usePuzzleModel = PuzzleClient.useModel

/** Returns stable, host-callable Puzzle actions. */
export const usePuzzleActions = PuzzleClient.useActions

/** Returns inert inspection and live branching controls for the Puzzle tape. */
export const usePuzzleReplay = PuzzleClient.useReplay
