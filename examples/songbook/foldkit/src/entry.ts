import { Layer } from 'effect'
import { Runtime } from 'foldkit'
import { SongbookProgram } from 'songbook-core-example'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: SongbookProgram,
  resources: Layer.empty,
  view,
})

Runtime.run(application)
