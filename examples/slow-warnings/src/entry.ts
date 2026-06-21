import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import {
  Message,
  Model,
  handleSlow,
  init,
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
  container: document.getElementById('root'),
  slow: {
    show: 'Always',
    onSlow: handleSlow,
  },
  devTools: {
    overlay,
    Message,
  },
})

Runtime.run(application)
