import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: {
    overlay,
    maxEntries: 250,
  },
})

Runtime.run(application)
