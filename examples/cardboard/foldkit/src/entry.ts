import { Effect } from 'effect'
import { Runtime } from 'foldkit'

import { makeCardboardApplication } from './application.js'
import { cardboardFoldkitStartForLocation } from './route.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

const renderRouteError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  const main = document.createElement('main')
  main.className = 'route-error'
  main.textContent = `Cardboard route failed: ${message}`
  root.replaceChildren(main)
}

Effect.runPromise(
  cardboardFoldkitStartForLocation(
    window.location.pathname,
    window.location.search,
  ),
).then(
  start => Runtime.run(makeCardboardApplication(root, start)),
  renderRouteError,
)
