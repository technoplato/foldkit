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
    position: 'BottomLeft',
  },
})

Runtime.run(application)
