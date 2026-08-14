import { CounterProgram } from 'counter-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './index.js'
import { startInstantCounter } from './instantHost.js'

const instantAppId = import.meta.env.VITE_INSTANT_APP_ID

if (typeof instantAppId === 'string' && instantAppId !== '') {
  startInstantCounter(instantAppId)
} else {
  const application = Runtime.makeFoldkitApplication({
    container: document.getElementById('root'),
    devTools: {
      overlay,
    },
    program: CounterProgram,
    resources: Layer.empty,
    view,
  })

  Runtime.run(application)
}
