import type {
  PortfolioSnapshot,
  ReceivingInstruction,
  WalletAccount,
} from 'wallet-core-example'
import {
  type ReceivingQrHostOrigin,
  type ReceivingQrRuntimeMode,
  projectReceivingQr,
  receivingQrUnavailableLabel,
} from 'wallet-qr-example'

/** Renders one host-authorized public receiving QR projection. */
export const ReceivingQr = ({
  account,
  hostOrigin,
  instruction,
  portfolio,
  runtimeMode,
}: Readonly<{
  account: WalletAccount
  hostOrigin: ReceivingQrHostOrigin
  instruction: ReceivingInstruction
  portfolio: PortfolioSnapshot
  runtimeMode: ReceivingQrRuntimeMode
}>) => {
  const projection = projectReceivingQr({
    account,
    hostOrigin,
    instruction,
    portfolio,
    runtimeMode,
  })
  if (projection._tag === 'AvailableReceivingQr') {
    return (
      <div
        aria-label={`${account.displayName} ${instruction.assetId} public receiving QR`}
        className="wallet-public-receiving"
        data-wallet-qr-state="Available"
        data-wallet-qr-value={projection.payload}
      >
        <span>Public receive</span>
        <img
          alt={`${account.displayName} ${instruction.assetId} receiving QR code`}
          className="wallet-receiving-qr-image"
          height={192}
          src={projection.dataUrl}
          width={192}
        />
        <code>{projection.payload}</code>
      </div>
    )
  } else {
    return (
      <div
        aria-label={`${account.displayName} ${instruction.assetId} public receiving payload`}
        className="wallet-public-receiving wallet-receiving-qr-unavailable"
        data-wallet-qr-reason={projection.reason}
        data-wallet-qr-state="Unavailable"
      >
        <strong>{receivingQrUnavailableLabel(projection.reason)}</strong>
        <code>{instruction.portableUri}</code>
      </div>
    )
  }
}
