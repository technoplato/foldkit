import { Layer } from 'effect'
import { Runtime } from 'foldkit'
import { type Message, type Model, VendingProgram } from 'vending-core-example'
import type { WalletResources } from 'wallet-core-example'
import type { ReceivingQrHostOrigin } from 'wallet-qr-example'

import { overlay } from '@foldkit/devtools'

import { makeView } from './view.js'

/** Creates the Foldkit Vending application. */
export const makeVendingApplication = (
  container: HTMLElement | null,
  resources: Layer.Layer<WalletResources>,
  hostOrigin: ReceivingQrHostOrigin,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
      Message: VendingProgram.Message,
    },
    program: VendingProgram,
    resources,
    start,
    view: makeView(hostOrigin),
  })
