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
    show: 'Always',
    mode: { development: 'TimeTravel', production: 'Inspect' },
    banner: 'Welcome to our app! Browse the state tree to see how it works.',
  },
})

Runtime.run(application)
