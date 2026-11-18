/**
 * A visual fixture for looking at the React Reminders without an Instant
 * app: the same App on the made-up sample board, held in memory, with
 * links it shares kept in memory too, for screenshots and review only. The
 * app itself, `src/main.tsx`, always runs on Instant.
 * `/fixture/?at=/reminders/today` opens at any address.
 */
import { Effect, Layer } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  SyncedReminders,
  bindReminders,
  hostCalendar,
  makeTestLinkSharing,
  makeTestRemindersStore,
  sampleBoard,
} from 'reminders-core-example/browser'

import { ProgramProvider } from '@foldkit/react/interaction'

import { App } from '../src/App.js'

const launchAt =
  new URLSearchParams(window.location.search).get('at') ?? '/reminders'
window.history.replaceState(null, '', launchAt)

const store = await Effect.runPromise(
  makeTestRemindersStore(
    sampleBoard(hostCalendar.localOf(Date.now()).day),
    hostCalendar,
  ),
)

const sharing = await Effect.runPromise(makeTestLinkSharing())

const handle = Runtime.startHandle({
  program: SyncedReminders,
  sync: Runtime.Memory({ processor: 'reminders-fixture' }),
  resources: Layer.mergeAll(store.layer, sharing.layer),
  host: Processor.Host.React(),
})

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
