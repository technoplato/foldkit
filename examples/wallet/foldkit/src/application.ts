import { Layer } from 'effect'
import { Runtime } from 'foldkit'
import {
  type Message,
  type Model,
  WalletProgram,
  type WalletResources,
} from 'wallet-core-example'
import type { ReceivingQrHostOrigin } from 'wallet-qr-example'

import { overlay } from '@foldkit/devtools'

import { makeView } from './view.js'

/** The exact canonical Program used by the Foldkit Wallet renderer. */
export const walletFoldkitProgram: typeof WalletProgram = WalletProgram

/** Creates the Foldkit Wallet application from host context and a Program start. */
export const makeWalletApplication = (
  container: HTMLElement | null,
  resources: Layer.Layer<WalletResources>,
  hostOrigin: ReceivingQrHostOrigin,
  start: Runtime.ProgramStart<Model, Message> = Runtime.fresh(),
) =>
  Runtime.makeFoldkitApplication({
    container,
    devTools: {
      overlay,
      Message: walletFoldkitProgram.Message,
    },
    program: walletFoldkitProgram,
    resources,
    start,
    view: makeView(hostOrigin),
  })
