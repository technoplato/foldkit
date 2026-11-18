import { ActionMenu, Session } from 'foldkit'

import { isProfilePage } from './destination.js'
import { RemindersProgram } from './program.js'

/**
 * Reminders inside session state, with the one action menu over it. Each
 * device keeps its own screen by default, while the lists and reminders
 * are the same everywhere; Mirror navigation makes every device follow
 * along. The Profile tab shows no Back button; the tab bar leads out of
 * it.
 */
export const App = ActionMenu.compose({
  of: Session.compose({
    of: RemindersProgram,
    initialMode: 'SharedDomain',
    isTab: isProfilePage,
  }),
})

/** App Model: the reminders, the session, and the one navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: the reminders' Messages, session Actions, and menu Messages. */
export type AppMessage = typeof App.Message.Type
