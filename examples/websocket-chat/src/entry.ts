import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import {
  Message,
  Model,
  init,
  managedResources,
  subscriptions,
  update,
  view,
} from './main'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  managedResources,
  container: document.getElementById('root'),
  devTools: {
    overlay,
    Message,
  },
})

Runtime.run(application)
