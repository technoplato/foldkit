import { ActionMenu } from 'foldkit'

import { CounterProgram } from './program.js'

/**
 * The Counter with the one global action menu presented over it. The menu
 * is navigation state, so the session's synchronization mode decides
 * whether it mirrors across devices.
 */
export const App = ActionMenu.compose({ of: CounterProgram })

/** App Model: the count, flat, plus the navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: Counter Actions plus action menu Messages. */
export type AppMessage = typeof App.Message.Type
