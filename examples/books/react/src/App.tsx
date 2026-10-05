import type { MouseEvent, ReactElement } from 'react'
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

const isPlainClick = (event: MouseEvent<HTMLElement>): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

/**
 * Opens a link that leaves Books in a new tab, such as Amazon's sign-in,
 * so this tab and whatever is playing stay where they are. The frame
 * follows a link inside Books before this sees the click.
 */
const openLeavingLinksInNewTab = (event: MouseEvent<HTMLElement>): void => {
  const anchor =
    event.target instanceof Element ? event.target.closest('a[href]') : null
  if (
    !event.isDefaultPrevented() &&
    isPlainClick(event) &&
    anchor instanceof HTMLAnchorElement
  ) {
    event.preventDefault()
    window.open(anchor.href, '_blank', 'noopener,noreferrer')
  }
}

/**
 * The React Books window. It is the React Counter window, line for line:
 * the address bar follows the Program's stack, the frame paints the
 * library, a title, the player, and every sheet and question, keys route
 * to the Program, and the menu opens from its button. It adds two things:
 * Read Aloud's Google Books viewer, given to every painted tree as the
 * embed a picture book's page names, and a new tab for every link that
 * leaves Books. It never names a title, an Action, or a route.
 */
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main
      className="min-h-screen bg-white flex justify-center px-4 pt-4 pb-6"
      onClick={openLeavingLinksInNewTab}
    >
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
