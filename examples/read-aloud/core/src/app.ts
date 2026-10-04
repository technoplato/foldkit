import { ActionMenu, Session } from 'foldkit'

import { ReadAloudProgram } from './program.js'

/**
 * Read Aloud inside session state, with the one action menu over it. Each
 * device follows the reading on its own by default; Mirror navigation
 * makes every device show the page one of them turned to.
 */
export const App = ActionMenu.compose({
  of: Session.compose({ of: ReadAloudProgram, initialMode: 'SharedDomain' }),
})

/** App Model: Read Aloud, the session, and the one navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: Read Aloud's Messages, session Actions, and menu Messages. */
export type AppMessage = typeof App.Message.Type
