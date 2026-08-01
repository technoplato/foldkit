import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App, type Presenter } from './App.js'
import './styles.css'

const initialDestinationUri = window.location.pathname
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
