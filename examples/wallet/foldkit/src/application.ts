import { Runtime } from 'foldkit'
import { type Message, type Model, WalletProgram } from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import { overlay } from '@foldkit/devtools'

import { view } from './view.js'

/** The exact canonical Program used by the Foldkit Wallet renderer. */
export const walletFoldkitProgram = WalletProgram

/** Creates the page-owning Foldkit Wallet application from one Program start. */
export const makeWalletApplication = (
  container: HTMLElement | null,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
      Message: walletFoldkitProgram.Message,
    },
    program: walletFoldkitProgram,
    resources: SimulatedWalletResources,
    start,
    view,
  })
