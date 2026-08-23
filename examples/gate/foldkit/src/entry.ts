import { Runtime } from 'foldkit'
import { GateOriginHttpLive, GateProgram } from 'gate-core-example'

import { overlay } from '@foldkit/devtools'

import { view } from './index.js'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: GateProgram,
  resources: GateOriginHttpLive,
  view,
})

Runtime.run(application)
