import { Program } from 'foldkit'

import { PuzzleProgram } from './program.js'

/**
 * Puzzle plus the one global Action menu.
 * Instant sync wraps this Program so Open/Closed is shared.
 */
export const App = Program.compose.actionMenu({
  of: PuzzleProgram,
})

/** App Model: product tape plus the Action menu slice. */
export type AppModel = typeof App.Model.Type
/** App Message: product Actions plus Action menu Messages. */
export type AppMessage = typeof App.Message.Type
