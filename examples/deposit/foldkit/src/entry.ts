import { Runtime } from 'foldkit'
import { freshWalletHostOrigin } from 'wallet-qr-example'
import {
  makeWebWalletResources,
  walletDataSourceFromEnvironment,
} from 'wallet-web-client-example'

import { makeDepositApplication } from './application.js'
import './styles.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

const dataSource = walletDataSourceFromEnvironment(
  import.meta.env['VITE_WALLET_DATA_SOURCE'],
)

Runtime.run(
  makeDepositApplication(
    root,
    makeWebWalletResources(dataSource),
    freshWalletHostOrigin,
  ),
)
