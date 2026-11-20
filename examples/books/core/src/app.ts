import { ActionMenu, Session } from 'foldkit'
import { Part } from 'foldkit/behavior'

import { BooksProgram } from './program.js'

/**
 * Books inside session state, with the one action menu over it. Each
 * device keeps its own screen and player by default, while the shelf,
 * progress, and bookmarks are the same everywhere; Mirror navigation makes
 * every browser, phone, and terminal follow along, and Keep navigation
 * local gives each its own again. A terminal is one more session: `books
 * open /books/a-tin-comet` moves the browsers that mirror, and a browser
 * moves the terminal. The Profile page is declared a tab in `routes.ts`,
 * so it shows no Back button; the tab bar leads out of it.
 */
export const App = ActionMenu.compose({
  of: Session.compose({
    // NOTE: the hold on a title or a word is Foldkit's rule, kept in this
    // device's Model by this composition. Without it a hold on the web
    // would ask for nothing, since no painter keeps a timer.
    of: Part.compose({ of: BooksProgram }),
    initialMode: 'SharedDomain',
  }),
})

/** App Model: the books, the session, and the one navigation stack. */
export type AppModel = typeof App.Model.Type
/** App Message: the books' Messages, session Actions, and menu Messages. */
export type AppMessage = typeof App.Message.Type
