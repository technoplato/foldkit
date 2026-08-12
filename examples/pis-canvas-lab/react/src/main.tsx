import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App, type Presenter } from './App.js'
import './styles.css'

// Counters Program expects a /counters… path. Bare "/" fails boot navigation.
const pathname = window.location.pathname
const initialDestinationUri =
  pathname === '/' || pathname === '' ? '/counters' : pathname
// presenter=a|b only picks React modal style (A unified modal vs B native dialog).
// Default A. Optional: ?presenter=b
const presenter: Presenter =
  new URL(window.location.href).searchParams.get('presenter') === 'b'
    ? 'ReactB'
    : 'ReactA'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App initialDestinationUri={initialDestinationUri} presenter={presenter} />
  </StrictMode>,
)
