import { Schema as S } from 'effect'
import { printSolanaPayTransferUri } from 'wallet-core-example'

import { ClipLine, revealedLines } from './clip.js'
import {
  type Model,
  clipSku,
  copyAddressLabel,
  lastControlLabel,
  settleSolDisplay,
} from './model.js'

/** Public facts a display Client needs to paint the machine. */
export const VendingDisplay = S.Struct({
  digits: S.String,
  lastControl: S.NullOr(S.String),
  skuLabel: S.String,
  listPriceDisplay: S.String,
  vendPhase: S.String,
  address: S.NullOr(S.String),
  solanaPayUri: S.NullOr(S.String),
  clipboard: S.String,
  copyLabel: S.String,
  incomingCount: S.Number,
  clipPlayback: S.String,
  clipLines: S.Array(ClipLine),
  walletPhase: S.String,
})
/** Public facts a display Client needs to paint the machine. */
export type VendingDisplay = typeof VendingDisplay.Type

const receiveAddress = (model: Model): string | undefined => {
  if (model.selection._tag === 'Locked') {
    return model.selection.address
  }
  if (model.wallet._tag === 'ready') {
    return model.wallet.address
  }
  return undefined
}

/** Solana Pay URI for the till receive address and Devnet settle amount. */
export const solanaPayUriForAddress = (address: string): string =>
  printSolanaPayTransferUri({
    recipient: address,
    amount: settleSolDisplay,
    label: clipSku.name,
    cluster: 'devnet',
  })

/** Projects the Model into a renderer-neutral display snapshot. */
export const projectVendingDisplay = (model: Model): VendingDisplay => {
  const address = receiveAddress(model)
  const skuLabel =
    model.selection._tag === 'Locked' ? model.selection.sku.name : clipSku.name
  const lastControl = lastControlLabel(model.lastControl)
  return VendingDisplay.make({
    digits: model.keypadBuffer,
    lastControl: lastControl === undefined ? null : lastControl,
    skuLabel,
    listPriceDisplay: model.listPriceDisplay,
    vendPhase: model.vendPhase._tag,
    address: address === undefined ? null : address,
    solanaPayUri:
      address === undefined ? null : solanaPayUriForAddress(address),
    clipboard: model.clipboard._tag,
    copyLabel: copyAddressLabel(model.clipboard),
    incomingCount: model.incoming.length,
    clipPlayback: model.clipPlayback._tag,
    clipLines: revealedLines(model.clipPlayback),
    walletPhase: model.wallet._tag,
  })
}
