import { Runtime } from 'foldkit'

import { Model, init, update, view } from './main'

const element = Runtime.makeElement({
  Model,
  Message,
  init,
  update,
  view,
  container: document.getElementById('widget'),
})

Runtime.run(element)
