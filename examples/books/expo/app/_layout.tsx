import { type ReactElement, Suspense, use } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { FoldkitRouterStack } from '@foldkit/react-native/expo-router'
import { ProgramProvider } from '@foldkit/react-native/interaction'

import { Looked } from '../src/looked'
import { startExpoBooks } from '../src/startExpoBooks'

const started = startExpoBooks()

const Books = (): ReactElement => {
  const books = use(started)
  return (
    <ProgramProvider bound={books}>
      <Looked books={books}>
        <FoldkitRouterStack />
      </Looked>
    </ProgramProvider>
  )
}

/**
 * The Books app's root layout. It is the Counter's, line for line: every
 * screen, title, sheet and address comes from the Books Program through
 * the generic stack, in the look the Program resolved, and the menu opens
 * from each page's header. It names no book, no Action and no route.
 */
export default function Layout(): ReactElement {
  return (
    <SafeAreaProvider>
      <Suspense fallback={null}>
        <Books />
      </Suspense>
    </SafeAreaProvider>
  )
}
