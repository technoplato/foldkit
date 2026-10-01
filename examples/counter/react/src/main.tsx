import {
  SyncedCounter,
  newProcessorInstance,
  startCounter,
} from 'counter-core-example'
import { Interaction, Processor } from 'foldkit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from './App.js'

const handle = startCounter({
  host: Processor.Host.React(),
  instance: newProcessorInstance(),
  tape: import.meta.env.VITE_COUNTER_TAPE === 'memory' ? 'Memory' : 'Instant',
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
    <ProgramProvider bound={Interaction.bind(SyncedCounter, handle)}>
      <App />
    </ProgramProvider>
  </StrictMode>,
)
