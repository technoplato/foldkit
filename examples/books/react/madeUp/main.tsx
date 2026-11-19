/**
 * The Books site on the made-up library: three titles nobody wrote, with
 * made-up words, that play without a sound and keep nothing once the
 * page closes. Nobody is signed in and no real library is read, so a
 * change can be looked at, and pictures taken, with no account at all.
 * `pnpm --filter books-react-example run dev:made-up` serves it, and
 * `?look=Dark` opens it in the dark look.
 */
import {
  bindBooks,
  newProcessorInstance,
  sharedMadeUpSession,
  startMadeUpBooks,
} from 'books-core-example/browser'
import { Interaction, Processor } from 'foldkit'
import {
  browserSystemAppearance,
  contrastOfState,
  modeOfState,
  paintContrastOnPage,
  paintModeOnPage,
} from 'foldkit/theme'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from '../src/App.js'
import './styles.css'

const lookTimeoutMs = 5_000

// NOTE: The library is made up; the browser is not. The Program hears
// this browser's own report of the system's appearance, as the served
// site does, so More Contrast can be looked at here.
//
// `?session=shared` makes it the one made-up session every device that
// asks for it shares, so a tab, a phone and a terminal can be watched
// moving together. Without it the session stays in this tab.
const host = Processor.Host.React()
const isSessionShared =
  new URLSearchParams(window.location.search).get('session') === 'shared'
const handle = await startMadeUpBooks({
  host,
  resources: browserSystemAppearance,
  ...(isSessionShared
    ? { sync: sharedMadeUpSession({ host, instance: newProcessorInstance() }) }
    : {}),
})

const tellPageItsMode = (): void => {
  const model = handle.readModel()
  if (model._tag === 'Ready') {
    paintModeOnPage(modeOfState(model.appearance), {
      root: document.documentElement,
      storage: window.localStorage,
    })
    paintContrastOnPage(
      contrastOfState(model.appearance),
      document.documentElement,
    )
  }
}
handle.subscribe(tellPageItsMode)
tellPageItsMode()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

const bound = bindBooks(handle)

// NOTE: `?look=Dark` or `?look=Light` opens the page in that look, by
// pressing the Program's own Action, so a picture can be taken of either.
const look = new URLSearchParams(window.location.search).get('look')
if (look === 'Dark' || look === 'Light') {
  await Interaction.whenSettled(bound, lookTimeoutMs)
  bound.press(`SetAppearance:${look}`)
}

createRoot(rootElement).render(
  <StrictMode>
    <ProgramProvider bound={bound}>
      <App />
    </ProgramProvider>
  </StrictMode>,
)
