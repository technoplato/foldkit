import type { BoundBooks } from 'books-core-example/browser'
import { StatusBar } from 'expo-status-bar'
import { initialAppearance } from 'foldkit/theme'
import { type ReactElement, type ReactNode, useSyncExternalStore } from 'react'

import { Themed, useLook } from '@foldkit/react-native/theme'

const ModeStatusBar = (): ReactElement => (
  <StatusBar style={useLook().mode === 'Dark' ? 'light' : 'dark'} />
)

/**
 * Tells every painter below the look Books resolved: the appearance its
 * Model holds, which follows the system until a person chooses light or
 * dark. The status bar takes the same mode. Nothing here asks the system;
 * the Program heard it as a fact.
 *
 * @example
 * ```tsx
 * <Looked books={books}>
 *   <FoldkitRouterStack />
 * </Looked>
 * ```
 */
export const Looked = ({
  books,
  children,
}: Readonly<{ books: BoundBooks; children: ReactNode }>): ReactElement => {
  const model = useSyncExternalStore(books.subscribe, books.readModel)
  return (
    <Themed
      appearance={model._tag === 'Ready' ? model.appearance : initialAppearance}
    >
      <ModeStatusBar />
      {children}
    </Themed>
  )
}
