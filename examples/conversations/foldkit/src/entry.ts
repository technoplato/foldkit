import { ConversationsProgram } from 'conversations-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './index.js'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: ConversationsProgram,
  resources: Layer.empty,
  view,
})

Runtime.run(application)
