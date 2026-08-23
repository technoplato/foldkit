import { CasinoProgram } from 'casino-core-example'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './mobile.js'
import { casinoBrowserResources } from './resources.js'
import './styles.css'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
  program: CasinoProgram,
  resources: casinoBrowserResources(),
  view,
})

Runtime.run(application)
