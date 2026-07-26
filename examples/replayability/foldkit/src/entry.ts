import { Effect, Layer } from 'effect'
import { factEndpoint, makeFactHttpClient } from 'fact-http-client-example'
import { Runtime } from 'foldkit'
import {
  Workbench,
  defaultReplayDestination,
  makeReplayabilityTapeStore,
  parseReplayDestination,
} from 'replayability-core-example'

import { BrowserCrypto, BrowserHttpClient } from '@effect/platform-browser'
import { overlay } from '@foldkit/devtools'

import { view } from './index.js'
import './styles.css'

const relativeRoute = `${window.location.pathname}${window.location.search}`

Effect.runPromise(
  parseReplayDestination(relativeRoute).pipe(
    Effect.catch(() => defaultReplayDestination('Counters')),
  ),
).then(destination => {
  const { program, resources } = Workbench.makeReplayWorkbench(
    destination,
    makeReplayabilityTapeStore(globalThis.fetch),
    BrowserCrypto.layer,
    Layer.provide(
      makeFactHttpClient(factEndpoint),
      BrowserHttpClient.layerFetch,
    ),
  )
  const application = Runtime.makeFoldkitApplication({
    container: document.getElementById('root'),
    devTools: {
      overlay,
    },
    program,
    resources,
    onModel: model => {
      if (
        Workbench.isReady(model) &&
        model.replaySaveStatus._tag === 'SavedReplay'
      ) {
        globalThis.history.replaceState(null, '', model.replaySaveStatus.uri)
      }
    },
    view,
  })

  Runtime.run(application)
}, globalThis.console.error)
