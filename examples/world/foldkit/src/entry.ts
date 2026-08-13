import { Runtime } from 'foldkit'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import { makeWorldApplication } from './application.js'
import './styles.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

Runtime.run(makeWorldApplication(root, SimulatedWalletResources))
