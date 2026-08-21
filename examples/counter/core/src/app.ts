import { Program } from 'foldkit'

import { CounterProgram } from './program.js'

/**
 * Counter plus the one global Action menu.
 * Instant sync wraps this Program so Open/Closed is shared.
 */
export const App = Program.compose.actionMenu({
  of: CounterProgram,
})

/** App Model: product count plus the Action menu slice. */
export type AppModel = typeof App.Model.Type
/** App Message: product Actions plus Action menu Messages. */
export type AppMessage = typeof App.Message.Type
