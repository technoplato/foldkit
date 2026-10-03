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
 * The React Multiple Counters window. It is the React Counter window,
 * line for line: the address bar follows the Program's stack, the frame
 * paints the list, a counter's page, and the delete question, keys route
 * to the Program, and the menu opens from its button. It never names a
 * counter, an Action, or a route.
 */
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <section className="w-full max-w-xl text-center space-y-6">
        <WhenReady>
          <NavigationFrame />
          <ActionMenuButton />
        </WhenReady>
      </section>
    </main>
  )
}
