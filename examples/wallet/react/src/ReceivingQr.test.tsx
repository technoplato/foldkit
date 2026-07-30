import { Array, Option } from 'effect'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { PortfolioSnapshot, ReceivingInstruction } from 'wallet-core-example'
import {
  freshWalletHostOrigin,
  inspectingWalletRuntimeMode,
  liveWalletRuntimeMode,
  portableWalletRouteOrigin,
  receivingQrUnavailableLabel,
} from 'wallet-qr-example'
import { simulatedPortfolio } from 'wallet-simulated-client-example'

import { ReceivingQr } from './ReceivingQr.js'

const ethereumAccount = Option.getOrThrow(
  Array.findFirst(
    simulatedPortfolio.accounts,
    account => account.accountId === 'simulated-ethereum-account',
  ),
)
const originalEthereumInstruction = Option.getOrThrow(
  Array.findFirst(
    simulatedPortfolio.receivingInstructions,
    instruction => instruction.accountId === ethereumAccount.accountId,
  ),
)
const ethereumCarrier = `ethereum:${ethereumAccount.address}@11155111`
const ethereumInstruction = ReceivingInstruction.make({
  ...originalEthereumInstruction,
  portableUri: ethereumCarrier,
})
const scannablePortfolio = PortfolioSnapshot.make({
  ...simulatedPortfolio,
  dataSource: 'Testnet',
  receivingInstructions: Array.map(
    simulatedPortfolio.receivingInstructions,
    instruction =>
      instruction.accountId === ethereumAccount.accountId
        ? ethereumInstruction
        : instruction,
  ),
})

const renderReceivingQr = (
  hostOrigin: typeof freshWalletHostOrigin | typeof portableWalletRouteOrigin,
  runtimeMode:
    | typeof liveWalletRuntimeMode
    | typeof inspectingWalletRuntimeMode,
  portfolio: PortfolioSnapshot = scannablePortfolio,
  instruction: ReceivingInstruction = ethereumInstruction,
): string =>
  renderToStaticMarkup(
    <ReceivingQr
      account={ethereumAccount}
      hostOrigin={hostOrigin}
      instruction={instruction}
      portfolio={portfolio}
      runtimeMode={runtimeMode}
    />,
  )

describe('React Wallet receiving QR', () => {
  test('renders an accessible image for fresh live host data', () => {
    const markup = renderReceivingQr(
      freshWalletHostOrigin,
      liveWalletRuntimeMode,
    )

    expect(markup).toContain('data-wallet-qr-state="Available"')
    expect(markup).toContain(`data-wallet-qr-value="${ethereumCarrier}"`)
    expect(markup).toContain(
      'alt="Simulated Sepolia Account ethereum:sepolia:eth receiving QR code"',
    )
    expect(markup).toContain('<img')
  })

  test('suppresses a scannable image for a portable route spoof', () => {
    const markup = renderReceivingQr(
      portableWalletRouteOrigin,
      liveWalletRuntimeMode,
    )

    expect(markup).toContain('data-wallet-qr-reason="PortableRoute"')
    expect(markup).toContain(receivingQrUnavailableLabel('PortableRoute'))
    expect(markup).toContain(ethereumCarrier)
    expect(markup).not.toContain('<img')
  })

  test('suppresses a scannable image while replay is being inspected', () => {
    const markup = renderReceivingQr(
      freshWalletHostOrigin,
      inspectingWalletRuntimeMode,
    )

    expect(markup).toContain('data-wallet-qr-reason="ReplayInspection"')
    expect(markup).toContain(receivingQrUnavailableLabel('ReplayInspection'))
    expect(markup).toContain(ethereumCarrier)
    expect(markup).not.toContain('<img')
  })

  test('labels fixture payloads as explicitly non-scannable', () => {
    const markup = renderReceivingQr(
      freshWalletHostOrigin,
      liveWalletRuntimeMode,
      simulatedPortfolio,
      originalEthereumInstruction,
    )

    expect(markup).toContain('data-wallet-qr-reason="FixturePortfolio"')
    expect(markup).toContain(receivingQrUnavailableLabel('FixturePortfolio'))
    expect(markup).toContain(originalEthereumInstruction.portableUri)
    expect(markup).not.toContain('<img')
  })
})
