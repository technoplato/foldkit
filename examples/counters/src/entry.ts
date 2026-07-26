import {
  MultipleCountersProgram,
  StaticCounterFactClient,
} from 'counters-core-example'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { view } from './main'

const application = Runtime.makeFoldkitApplication({
  program: MultipleCountersProgram,
  resources: StaticCounterFactClient,
  view,
  container: document.getElementById('root'),
  devTools: {
    overlay,
  },
})

Runtime.run(application)
