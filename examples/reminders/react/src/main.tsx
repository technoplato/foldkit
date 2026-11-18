import { Processor } from 'foldkit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  bindReminders,
  newProcessorInstance,
  startReminders,
} from 'reminders-core-example/browser'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from './App.js'

const appId = import.meta.env.VITE_INSTANT_APP_ID ?? ''
if (appId === '') {
  throw new Error(
    'Reminders needs VITE_INSTANT_APP_ID; run it through scripts/with-reminders-env.',
  )
}

const handle = startReminders({
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
    <ProgramProvider bound={bindReminders(handle)}>
      <App />
    </ProgramProvider>
  </StrictMode>,
)
