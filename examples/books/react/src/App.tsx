import type { ReactElement } from 'react'
import { readAloudEmbeds } from 'read-aloud-react-bindings-example'

import { EmbedPaintersProvider } from '@foldkit/react'
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
 * The React Books window. It is the React Counter window, line for line:
 * the address bar follows the Program's stack, the frame paints the
 * library, a title, the player, and every sheet and question, keys route
 * to the Program, and the menu opens from its button. The one thing it
 * adds is Read Aloud's Google Books viewer, given to every painted tree as
 * the embed a picture book's page names. It never names a title, an
 * Action, or a route.
 */
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main className="min-h-screen bg-white flex justify-center px-4 pt-4 pb-6">
      <section className="w-full max-w-2xl text-center space-y-6">
        <EmbedPaintersProvider value={readAloudEmbeds}>
          <WhenReady>
            <NavigationFrame />
            <ActionMenuButton />
          </WhenReady>
        </EmbedPaintersProvider>
      </section>
    </main>
  )
}
