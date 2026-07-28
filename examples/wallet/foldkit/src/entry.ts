import { Effect } from 'effect'
import { Runtime } from 'foldkit'
import {
  makeWebWalletResources,
  walletDataSourceFromEnvironment,
} from 'wallet-web-client-example'

import { makeWalletApplication } from './application.js'
import { logBuildProvenance } from './buildProvenance.js'
import { walletFoldkitStartForLocation } from './route.js'
import './styles.css'

logBuildProvenance()

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

const renderRouteError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  const main = document.createElement('main')
  const heading = document.createElement('h1')
  const detail = document.createElement('p')
  main.className = 'min-h-screen bg-slate-950 p-8 text-white'
  heading.className = 'text-2xl font-semibold'
  heading.textContent = 'Wallet route unavailable'
  detail.className = 'mt-3 font-mono text-sm text-rose-200'
  detail.textContent = message
  main.append(heading, detail)
  root.replaceChildren(main)
}

Effect.runPromise(
  walletFoldkitStartForLocation(
    window.location.pathname,
    window.location.search,
  ),
).then(
  start =>
    Runtime.run(
      makeWalletApplication(
        root,
        makeWebWalletResources(
          walletDataSourceFromEnvironment(
            import.meta.env.VITE_WALLET_DATA_SOURCE,
          ),
        ),
        start,
      ),
    ),
  renderRouteError,
)
