import {
  bindBooks,
  newProcessorInstance,
  startBooks,
} from 'books-core-example/browser'
import { Processor, Runtime, Telemetry } from 'foldkit'
import {
  contrastOfState,
  modeOfState,
  paintContrastOnPage,
  paintModeOnPage,
} from 'foldkit/theme'
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

const appVersion = import.meta.env.VITE_APP_VERSION ?? import.meta.env.MODE

const handle = startBooks({
  appId,
  host: Processor.Host.React(),
  instance: newProcessorInstance(),
  clientMetadata: () => Runtime.readBrowserClientMetadata({ appVersion }),
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

// NOTE: The Program holds the look. The page is only told: each time the
// Model's mode or contrast changes, this host sets them on the page and
// mirrors the mode for the next first paint (index.html reads the mirror
// before React starts). No component reads the system, the mirror, or
// the attributes.
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
