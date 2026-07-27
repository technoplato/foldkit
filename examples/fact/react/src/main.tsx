import { initialFactRoute } from 'fact-react-bindings-example'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { FactReactClient } from './factReactClient.js'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <FactReactClient.Provider
      initialRoute={initialFactRoute}
      fallback={lifecycle => (
        <main className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-400">
          Fact Program · {lifecycle._tag}
        </main>
      )}
    >
      <App />
    </FactReactClient.Provider>
  </StrictMode>,
)
