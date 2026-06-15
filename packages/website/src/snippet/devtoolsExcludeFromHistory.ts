import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  devTools: {
    overlay,
    excludeFromHistory: ['TickedFrame', 'MovedPointer'],
  },
})

Runtime.run(application)
