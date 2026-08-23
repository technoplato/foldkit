import { Path, surfaceFor } from 'puzzle-core-example'
import 'puzzle-react-bindings-example'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ProgramKeyBindings } from '@foldkit/react'

import { App } from './App.js'
import { ScreenApp } from './ScreenApp.js'
import { startInstantPuzzle } from './instantHost.js'

startInstantPuzzle()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

const isBespokeWindow =
  new URLSearchParams(window.location.search).get('window') === 'bespoke'
document.title = surfaceFor(isBespokeWindow ? 'react' : 'react-screen').title

createRoot(rootElement).render(
  <StrictMode>
    <ProgramKeyBindings path={Path()}>
      {isBespokeWindow ? <App /> : <ScreenApp />}
    </ProgramKeyBindings>
  </StrictMode>,
)
