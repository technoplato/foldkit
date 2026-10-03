import { ActionMenu, Session } from 'foldkit'

import { CountersProgram } from './program.js'

/**
 * The Multiple Counters inside session state, with the one action menu
 * presented over them. The menu lists every counter's Actions, `Increment
 * counter 3` included, and the session decides whether opening a page
 * moves every device or only this one.
 */
export const App = ActionMenu.compose({
  of: Session.compose({ of: CountersProgram }),
})

/** App Model: the counters, the session, and the one navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: the counters' Messages, session Actions, and menu Messages. */
export type AppMessage = typeof App.Message.Type
