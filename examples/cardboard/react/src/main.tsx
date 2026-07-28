import { initialCardboardRoute } from 'cardboard-core-example'
import { parseCardboardInitialRoute } from 'cardboard-react-bindings-example'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { logBuildProvenance } from './buildProvenance.js'

logBuildProvenance()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)
const relativePath = `${window.location.pathname}${window.location.search}`
const initialRoute =
  relativePath === '/'
    ? Promise.resolve(initialCardboardRoute)
    : parseCardboardInitialRoute(relativePath)

void initialRoute.then(
  route => {
    root.render(
      <StrictMode>
        <App initialRoute={route} />
      </StrictMode>,
    )
  },
  error => {
    const message = error instanceof Error ? error.message : String(error)
    root.render(
      <main className="route-error">Cardboard route failed: {message}</main>,
    )
  },
)
