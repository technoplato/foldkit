import type { ReactElement } from 'react'

import {
  ActionMenuButton,
  WhenReady,
  useKeyBindings,
} from '@foldkit/react/interaction'
import {
  NavigationFrame,
  useBrowserHistory,
  useDocumentTitle,
} from '@foldkit/react/navigation'

/**
 * The React Reminders window. It is the React Books window, line for line:
 * the address bar follows the Program's stack, the frame paints home, a
 * list, a reminder, and every sheet and question, keys route to the
 * Program, and the menu opens from its button. It never names a list, an
 * Action, or a route.
 */
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main className="reminders-app">
      <section className="reminders-page">
        <WhenReady>
          <NavigationFrame />
          <ActionMenuButton />
        </WhenReady>
      </section>
    </main>
  )
}
