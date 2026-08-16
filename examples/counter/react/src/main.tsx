import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { startInstantCounterWindow } from './instantHost.js'

const instantAppId = import.meta.env.VITE_INSTANT_APP_ID
if (typeof instantAppId === 'string' && instantAppId !== '') {
  startInstantCounterWindow(instantAppId)
}

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
