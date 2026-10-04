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
 * The React Read Aloud window: the address bar follows the Program's
 * stack, the frame paints the shelf and each book's page, keys route to
 * the Program, and the menu opens from its button. The one thing it adds
 * is the Google Books viewer, given to every painted tree as the embed
 * the page's preview names. It never names a book, an Action, or a route.
 */
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main className="min-h-screen bg-white flex justify-center px-4 pt-6 pb-10">
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
