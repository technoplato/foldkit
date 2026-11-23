import { Processor } from 'foldkit'
import {
  bindCounters,
  newProcessorInstance,
  startCountersAt,
} from 'multiple-counters-core-example'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from './App.js'

const handle = startCountersAt(
  { host: Processor.Host.React(), instance: newProcessorInstance() },
  window.location.search,
)

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
    <ProgramProvider bound={bindCounters(handle)}>
      <App />
    </ProgramProvider>
  </StrictMode>,
)
