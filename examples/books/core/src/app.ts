import { ActionMenu, Session } from 'foldkit'

import { isProfilePage } from './destination.js'
import { BooksProgram } from './program.js'

/**
 * Books inside session state, with the one action menu over it. Each
 * device keeps its own screen and player by default, while the shelf,
 * progress, and bookmarks are the same everywhere; Mirror navigation makes
 * every browser, phone, and terminal follow along, and Keep navigation
 * local gives each its own again. A terminal is one more session: `books
 * open /books/a-new-earth` moves the browsers that mirror, and a browser
 * moves the terminal. The Profile tab shows no Back button; the tab bar
 * leads out of it.
 */
export const App = ActionMenu.compose({
  of: Session.compose({
    of: BooksProgram,
    initialMode: 'SharedDomain',
    isTab: isProfilePage,
  }),
})

/** App Model: the books, the session, and the one navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: the books' Messages, session Actions, and menu Messages. */
export type AppMessage = typeof App.Message.Type
