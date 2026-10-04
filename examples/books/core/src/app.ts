import { ActionMenu, Processor, Session } from 'foldkit'

import { isProfilePage } from './destination.js'
import { BooksProgram } from './program.js'

/**
 * The Hosts that keep their own screen and player even while the session
 * mirrors navigation: the terminals. A terminal plays in the background
 * and answers `books pause`, so a browser's moves never land on it, and
 * its own moves stay on it: Safari going to the first tab leaves
 * `books listen a-new-earth` playing.
 */
export const terminalHosts: ReadonlyArray<Processor.Host.Host> = [
  Processor.Host.Cli(),
  Processor.Host.Tui(),
  Processor.Host.OpenTui(),
]

/**
 * Books inside session state, with the one action menu over it. Each
 * device keeps its own screen and player by default, while the shelf,
 * progress, and bookmarks are the same everywhere; Mirror navigation makes
 * every browser and phone follow along, and terminals keep their own. The
 * Profile tab shows no Back button; the tab bar leads out of it.
 */
export const App = ActionMenu.compose({
  of: Session.compose({
    of: BooksProgram,
    initialMode: 'SharedDomain',
    isTab: isProfilePage,
    ownNavigationHosts: terminalHosts,
  }),
})

/** App Model: the books, the session, and the one navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: the books' Messages, session Actions, and menu Messages. */
export type AppMessage = typeof App.Message.Type
