/**
 * The Books site on the made-up library: three titles nobody wrote, with
 * made-up words, that play without a sound and keep nothing once the
 * page closes. Nobody is signed in and no real library is read, so a
 * change can be looked at, and pictures taken, with no account at all.
 * `pnpm --filter books-react-example run dev:made-up` serves it.
 */
import { bindBooks, startMadeUpBooks } from 'books-core-example/browser'
import { Processor } from 'foldkit'
import { modeOfState, paintModeOnPage } from 'foldkit/theme'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from '../src/App.js'
import './styles.css'

const handle = await startMadeUpBooks({ host: Processor.Host.React() })

const tellPageItsMode = (): void => {
  const model = handle.readModel()
  if (model._tag === 'Ready') {
    paintModeOnPage(modeOfState(model.appearance), {
      root: document.documentElement,
      storage: window.localStorage,
    })
  }
}
handle.subscribe(tellPageItsMode)
tellPageItsMode()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ProgramProvider bound={bindBooks(handle)}>
      <App />
    </ProgramProvider>
  </StrictMode>,
)
