import { Message, Model, init, update } from 'counter-core-example'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './index.js'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: {
    overlay,
    Message,
  },
})

Runtime.run(application)
