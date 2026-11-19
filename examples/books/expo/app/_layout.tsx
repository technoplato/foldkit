import type { ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { FoldkitRouterStack } from '@foldkit/react-native/expo-router'
import { ProgramProvider } from '@foldkit/react-native/interaction'
import { PaintReporter } from '@foldkit/react-native/telemetry'

import { BooksGate } from '../src/booksGate'
import { Looked } from '../src/looked'
import { noteBooksLaidOut, recordBooksPaint } from '../src/startExpoBooks'

/**
 * The Books app's root layout. It is the Counter's, line for line: every
 * screen, title, sheet and address comes from the Books Program through
 * the generic stack, in the look the Program resolved, and the menu opens
 * from each page's header. The gate opens the library, a person's own
 * once they are signed in. It names no book, no Action and no route.
 */
export default function Layout(): ReactElement {
  return (
    <SafeAreaProvider>
      <BooksGate>
        {books => (
          <ProgramProvider bound={books}>
            <Looked books={books}>
              <PaintReporter
                record={recordBooksPaint}
                laidOut={noteBooksLaidOut}
              >
                <FoldkitRouterStack />
              </PaintReporter>
            </Looked>
          </ProgramProvider>
        )}
      </BooksGate>
    </SafeAreaProvider>
  )
}
