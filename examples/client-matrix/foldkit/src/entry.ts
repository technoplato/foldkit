import { ClientMatrixProgram } from 'client-matrix-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

const application = Runtime.makeFoldkitApplication({
  program: ClientMatrixProgram,
  resources: Layer.empty,
  view,
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
})

Runtime.run(application)
