import { Runtime } from 'foldkit'
import {
  InertPaymentProcessorLive,
  PaymentsProgram,
} from 'payments-core-example'

import { overlay } from '@foldkit/devtools'

import { view } from './index.js'
import './styles.css'

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: {
    overlay,
    Message: PaymentsProgram.Message,
  },
  program: PaymentsProgram,
  resources: InertPaymentProcessorLive,
  view,
})

Runtime.run(application)
