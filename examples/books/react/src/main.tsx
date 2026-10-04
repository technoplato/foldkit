import {
  bindBooks,
  newProcessorInstance,
  startBooks,
} from 'books-core-example/browser'
import { Processor, Telemetry } from 'foldkit'
import { Profiler, type ProfilerOnRenderCallback, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from './App.js'

const appId = import.meta.env.VITE_INSTANT_APP_ID ?? ''
if (appId === '') {
  throw new Error(
    'Books needs VITE_INSTANT_APP_ID; run it through scripts/with-books-env.',
  )
}

const handle = startBooks({
  appId,
  host: Processor.Host.React(),
  instance: newProcessorInstance(),
})

const telemetry = Telemetry.attach(handle, {
  app: 'books',
  sink: Telemetry.browserSink(),
})

const recordCommit: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
  telemetry.recordRendered({
    painter: 'React',
    durationMs: actualDuration,
    phase,
  })
}

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
    <Profiler id="books" onRender={recordCommit}>
      <ProgramProvider bound={bindBooks(handle)}>
        <App />
      </ProgramProvider>
    </Profiler>
  </StrictMode>,
)
