import { Layer } from 'effect'
import { Runtime } from 'foldkit'
import { IngestProgram } from 'ingest-core-example'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: IngestProgram,
  resources: Layer.empty,
  view,
})

Runtime.run(application)
