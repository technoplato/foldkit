import { Runtime } from 'foldkit'

import { Message, Model, init, update, view } from './main'

const application = Runtime.makeApplication({
  Model,
  Message,
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: false,
})

Runtime.run(application)
