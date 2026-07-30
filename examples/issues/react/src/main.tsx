import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { logBuildProvenance } from './buildProvenance.js'
import './styles.css'

logBuildProvenance()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Expected #root')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
