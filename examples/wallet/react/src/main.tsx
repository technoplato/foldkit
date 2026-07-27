import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  initialWalletRoute,
  parseWalletInitialRoute,
} from 'wallet-react-bindings-example'

import { App } from './App.js'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)

const renderRouteError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  root.render(
    <StrictMode>
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-rose-400/40 bg-rose-950/40 p-6">
          <h1 className="text-2xl font-semibold">Wallet route unavailable</h1>
          <p className="mt-3 font-mono text-sm text-rose-100">{message}</p>
        </div>
      </main>
    </StrictMode>,
  )
}

const relativePath = `${window.location.pathname}${window.location.search}`
const initialRoute =
  window.location.pathname === '/' && window.location.search === ''
    ? Promise.resolve(initialWalletRoute)
    : parseWalletInitialRoute(relativePath)

void initialRoute.then(route => {
  root.render(
    <StrictMode>
      <App initialRoute={route} />
    </StrictMode>,
  )
}, renderRouteError)
