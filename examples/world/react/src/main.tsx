import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorldProvider } from 'world-react-bindings-example'

import { App } from './App.js'
import './styles.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <WorldProvider>
      <App />
    </WorldProvider>
  </StrictMode>,
)
