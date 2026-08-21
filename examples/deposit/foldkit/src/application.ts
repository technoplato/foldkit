import { DepositProgram, type Message, type Model } from 'deposit-core-example'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'
import type { WalletResources } from 'wallet-core-example'
import type { ReceivingQrHostOrigin } from 'wallet-qr-example'

import { overlay } from '@foldkit/devtools'

import { makeView } from './view.js'

/** Creates the Foldkit Deposit application. */
export const makeDepositApplication = (
  container: HTMLElement | null,
  resources: Layer.Layer<WalletResources>,
  hostOrigin: ReceivingQrHostOrigin,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
      Message: DepositProgram.Message,
    },
    program: DepositProgram,
    resources,
    start,
    view: makeView(hostOrigin),
  })
