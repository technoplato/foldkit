import { Path, surfaceFor } from 'counter-core-example'
import 'counter-react-bindings-example'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ProgramKeyBindings } from '@foldkit/react'

import { App } from './App.js'
import { ScreenApp } from './ScreenApp.js'
import { startInstantCounter } from './instantHost.js'

startInstantCounter()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

const isScreenWindow =
  new URLSearchParams(window.location.search).get('window') === 'screen'
document.title = surfaceFor(isScreenWindow ? 'react-screen' : 'react').title

createRoot(rootElement).render(
  <StrictMode>
    <ProgramKeyBindings path={Path()}>
      {isScreenWindow ? <ScreenApp /> : <App />}
    </ProgramKeyBindings>
  </StrictMode>,
)
