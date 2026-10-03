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
 * The React Counter window. It keeps the address bar on the Program's
 * plan, paints whatever screen the plan shows, routes keys, and presents
 * the action menu, all through the generic adapters. It never names
 * Increment, Decrement, Reset, or a route, and writes no words or screen
 * styles of its own: `/counter/session`, `Starting Counter…`, `Actions
 * (⌘K)`, the tab title `Counter | React`, and the look of the count and
 * its buttons come from the Program and Foldkit.
 */
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <section className="w-full max-w-sm text-center space-y-6">
        <WhenReady>
          <NavigationFrame />
          <ActionMenuButton className="text-sm text-gray-500 underline-offset-4 hover:underline" />
        </WhenReady>
      </section>
    </main>
  )
}
