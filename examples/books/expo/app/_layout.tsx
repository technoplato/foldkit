import { type ReactElement, Suspense, use } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { FoldkitRouterStack } from '@foldkit/react-native/expo-router'
import {
  ActionMenuButton,
  ProgramProvider,
} from '@foldkit/react-native/interaction'

import { startExpoBooks } from '../src/startExpoBooks'

const started = startExpoBooks()

const Books = (): ReactElement => (
  <ProgramProvider bound={use(started)}>
    <FoldkitRouterStack />
    <ActionMenuButton />
  </ProgramProvider>
)

/**
 * The Books app's root layout. It is the Counter's, line for line: every
 * screen, title, sheet and address comes from the Books Program through
 * the generic stack, and the menu opens from its button. It names no
 * book, no Action and no route.
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
