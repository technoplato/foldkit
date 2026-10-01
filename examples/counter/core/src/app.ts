import { ActionMenu, Session } from 'foldkit'

import { CounterProgram } from './program.js'

/**
 * The Counter inside session state, with the one global action menu
 * presented over it. The menu is navigation, and the session's mode is
 * shared state every device folds from the tape: choosing "Keep navigation
 * local" from any device keeps every menu on its own device.
 */
export const App = ActionMenu.compose({
  of: Session.compose({ of: CounterProgram }),
})

/** App Model: the count and the session, flat, plus the navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: Counter Actions, session Actions, and menu Messages. */
export type AppMessage = typeof App.Message.Type
