import { Option } from 'effect'
import { Navigation, Processor } from 'foldkit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  bindReadAloud,
  declared,
  newProcessorInstance,
  startReadAloud,
} from 'read-aloud-core-example/browser'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from './App.js'

const appId = import.meta.env.VITE_INSTANT_APP_ID ?? ''
if (appId === '') {
  throw new Error(
    'Read Aloud needs VITE_INSTANT_APP_ID; run it through examples/books/scripts/with-books-env.',
  )
}

const shelfPath = Navigation.defaultUri(declared)
if (window.location.pathname === '/' && Option.isSome(shelfPath)) {
  window.history.replaceState(null, '', shelfPath.value)
}

const handle = startReadAloud({
  appId,
  host: Processor.Host.React(),
  instance: newProcessorInstance(),
})

const hot = import.meta.hot
if (hot !== undefined) {
  hot.dispose(() => {
    void handle.stop()
  })
}

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ProgramProvider bound={bindReadAloud(handle)}>
      <App />
    </ProgramProvider>
  </StrictMode>,
)
