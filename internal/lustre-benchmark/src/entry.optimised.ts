import { Runtime } from 'foldkit'

import { Message, Model, init, update } from './main'
import { view } from './main.optimised'

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
