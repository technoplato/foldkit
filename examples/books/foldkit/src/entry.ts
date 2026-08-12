import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './index.js'
import { BooksFoldkitProgram } from './playback.js'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: BooksFoldkitProgram,
  resources: Layer.empty,
  view,
})

Runtime.run(application)
