import { Array, Effect, Option, Queue } from 'effect'
import * as Runtime from 'foldkit/program-runtime'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { walletCliProgram } from 'wallet-cli-example'
import {
  LoadedPortfolio,
  Model,
  PortfolioSnapshot,
  ReceivingInstruction,
  TransferRequest,
  WalletProgram,
  primaryReceivingInstruction,
} from 'wallet-core-example'
import {
  freshWalletHostOrigin,
  portableWalletRouteOrigin,
} from 'wallet-qr-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'
import { walletOpenTuiProgram } from 'wallet-tui-example/presentation'

import {
  actionForWalletTerminalInput,
  doesWalletTerminalFrameFit,
  makeWalletTerminalResizeEvents,
  renderWalletTerminal,
  sendWalletTransaction,
  walletTerminalFundingLines,
  walletTerminalHistoryLines,
  walletTerminalObservationLines,
  walletTerminalProgram,
  walletTerminalSelectorLines,
} from './host.js'

const scannableEthereumModel = (model: Model): Model => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    throw new Error('Expected a loaded Wallet portfolio')
  }
  const maybeInstruction = primaryReceivingInstruction(model)
  if (Option.isNone(maybeInstruction)) {
    throw new Error('Expected a selected receiving instruction')
  }
  const instruction = maybeInstruction.value
  const maybeAccount = Array.findFirst(
    model.portfolio.snapshot.accounts,
    account => account.accountId === instruction.accountId,
  )
  if (
    Option.isNone(maybeAccount) ||
    maybeAccount.value.chainId !== 'ethereum'
  ) {
    throw new Error('Expected the selected Ethereum account')
  }
  const nextReceivingInstruction = ReceivingInstruction.make({
    ...instruction,
    portableUri: `ethereum:${maybeAccount.value.address}@11155111`,
  })
  const nextReceivingInstructions = Array.map(
    model.portfolio.snapshot.receivingInstructions,
    candidate =>
      candidate.accountId === instruction.accountId &&
      candidate.assetId === instruction.assetId
        ? nextReceivingInstruction
        : candidate,
  )
  const nextPortfolio = PortfolioSnapshot.make({
    ...model.portfolio.snapshot,
    dataSource: 'Testnet',
    receivingInstructions: nextReceivingInstructions,
  })
  return Model.make({
    ...model,
    portfolio: LoadedPortfolio.make({ snapshot: nextPortfolio }),
  })
}

describe('Wallet Effect Terminal host', () => {
  it('consumes the exact canonical Wallet Program export', () => {
    expect(walletTerminalProgram).toBe(WalletProgram)
    expect(walletCliProgram).toBe(WalletProgram)
    expect(walletOpenTuiProgram).toBe(WalletProgram)
  })

  it('renders every required operation and maps native input', async () => {
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: WalletProgram,
            resources: SimulatedWalletResources,
          })
          const initialized = yield* runtime.initialization
          yield* runtime.shutdown
          return initialized
        }),
      ),
    )
    const screen = renderWalletTerminal({
      model,
      mode: 'Live',
      hostOrigin: freshWalletHostOrigin,
      columns: 240,
      rows: 100,
      frame: 1,
      finalFrame: 1,
      isReceivingVisible: false,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })

    expect(screen).toContain('[s] Show')
    expect(screen).toContain('Selectors')
    expect(screen).toContain(
      'Network mode selector: Testnet (Devnet | Testnet | Live)',
    )
    expect(screen).toContain(
      'Wallet and cryptocurrency selector: simulated-ethereum-account · ETH · Ethereum Sepolia',
    )
    expect(screen).toContain('Test funding')
    expect(screen).toContain('Paginated history')
    expect(screen).toContain('Live observation')
    expect(walletTerminalSelectorLines(model)).toStrictEqual([
      'Network mode selector: Testnet (Devnet | Testnet | Live)',
      'Wallet and cryptocurrency selector: simulated-ethereum-account · ETH · Ethereum Sepolia',
    ])
    expect(walletTerminalFundingLines(model)).toStrictEqual([
      'Status: Ready to request',
      'Method: Adapter request available',
    ])
    expect(walletTerminalHistoryLines(model)).toEqual(
      expect.arrayContaining([
        'Status: Loaded; final page',
        'Visible normalized records: 1',
      ]),
    )
    expect(Array.join(walletTerminalHistoryLines(model), '\n')).toContain(
      'Incoming | Confirmed |',
    )
    expect(walletTerminalObservationLines(model)).toContain(
      'Status: Live for 1 account',
    )
    expect(Array.join(walletTerminalObservationLines(model), '\n')).toContain(
      'Latest: Confirmed simulated-history-',
    )
    expect(screen).toContain('[w] Create wallet')
    expect(screen).toContain('[t] Cycle Devnet/Testnet/Live')
    expect(screen).toContain('[r] Receive')
    expect(screen).toContain('[a] Edit amount')
    expect(screen).toContain('[d] Edit recipient')
    expect(screen).toContain('[y] Reload history')
    expect(screen).toContain('[g] Next history page')
    expect(screen).toContain('[f] Request test funds')
    expect(screen).toContain('[p] Preview')
    expect(screen).toContain('[n] Send')
    expect(screen).toContain('[c] Sign challenge')
    expect(actionForWalletTerminalInput('left')).toStrictEqual(
      Option.some('InspectPrevious'),
    )
    expect(actionForWalletTerminalInput('q')).toStrictEqual(Option.some('Quit'))
    expect(actionForWalletTerminalInput('w')).toStrictEqual(
      Option.some('CreateWallet'),
    )
    expect(actionForWalletTerminalInput('a')).toStrictEqual(
      Option.some('EditAmount'),
    )
    expect(actionForWalletTerminalInput('d')).toStrictEqual(
      Option.some('EditRecipient'),
    )
    expect(actionForWalletTerminalInput('y')).toStrictEqual(
      Option.some('ReloadHistory'),
    )
    expect(actionForWalletTerminalInput('g')).toStrictEqual(
      Option.some('NextHistoryPage'),
    )
    expect(actionForWalletTerminalInput('f')).toStrictEqual(
      Option.some('RequestTestFunding'),
    )

    const fixtureReceive = renderWalletTerminal({
      model,
      mode: 'Live',
      hostOrigin: freshWalletHostOrigin,
      columns: 240,
      rows: 100,
      frame: 1,
      finalFrame: 1,
      isReceivingVisible: true,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })
    expect(fixtureReceive).toContain('Not a scannable QR.')
    expect(fixtureReceive).toContain('Payload: /wallet/receive/')
    expect(fixtureReceive).not.toContain('QR payload:')

    const inspectedReceive = renderWalletTerminal({
      model,
      mode: 'Inspecting',
      hostOrigin: freshWalletHostOrigin,
      columns: 240,
      rows: 100,
      frame: 0,
      finalFrame: 1,
      isReceivingVisible: true,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })
    expect(inspectedReceive).toContain('Not a scannable QR.')
    expect(inspectedReceive).not.toContain('QR payload:')

    const portableReceive = renderWalletTerminal({
      model,
      mode: 'Live',
      hostOrigin: portableWalletRouteOrigin,
      columns: 240,
      rows: 100,
      frame: 1,
      finalFrame: 1,
      isReceivingVisible: true,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })
    expect(portableReceive).toContain('Not a scannable QR.')
    expect(portableReceive).not.toContain('QR payload:')

    const scannableModel = scannableEthereumModel(model)
    const completeReceive = renderWalletTerminal({
      model: scannableModel,
      mode: 'Live',
      hostOrigin: freshWalletHostOrigin,
      columns: 240,
      rows: 100,
      frame: 1,
      finalFrame: 1,
      isReceivingVisible: true,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })
    expect(completeReceive).toContain('QR payload: ethereum:')
    expect(completeReceive).toContain('█')
    expect(completeReceive).not.toContain('Resize the terminal')

    const constrainedReceive = renderWalletTerminal({
      model: scannableModel,
      mode: 'Live',
      hostOrigin: freshWalletHostOrigin,
      columns: 40,
      rows: 10,
      frame: 1,
      finalFrame: 1,
      isReceivingVisible: true,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })
    expect(constrainedReceive).toContain(
      'Not a scannable QR. Resize the terminal',
    )
    expect(constrainedReceive).toContain('Payload: ethereum:')
    expect(constrainedReceive).not.toContain('QR payload:')
    expect(constrainedReceive).not.toContain('█')

    const expandedReceive = renderWalletTerminal({
      model: scannableModel,
      mode: 'Live',
      hostOrigin: freshWalletHostOrigin,
      columns: 240,
      rows: 100,
      frame: 1,
      finalFrame: 1,
      isReceivingVisible: true,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })
    expect(expandedReceive).toContain('QR payload: ethereum:')
    expect(expandedReceive).toContain('█')
    expect(expandedReceive).not.toContain('Resize the terminal')

    expect(doesWalletTerminalFrameFit(['1234', '12'], 4, 2)).toBe(true)
    expect(doesWalletTerminalFrameFit(['1234', '12'], 3, 2)).toBe(false)
    expect(doesWalletTerminalFrameFit(['1234', '12'], 4, 1)).toBe(false)
  })

  it('redraws from native resize events and removes its listener', async () => {
    const source = new EventEmitter()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const events = yield* makeWalletTerminalResizeEvents(source)
          expect(source.listenerCount('resize')).toBe(1)
          source.emit('resize')
          yield* Queue.take(events)
        }),
      ),
    )
    expect(source.listenerCount('resize')).toBe(0)
  })

  it('awaits submission and observes the simulated transaction', async () => {
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: WalletProgram,
            resources: SimulatedWalletResources,
          })
          yield* runtime.initialization
          const submitted = yield* sendWalletTransaction(
            runtime,
            Option.some(
              TransferRequest.make({
                transferId: 'terminal-test-transfer',
                accountId: 'simulated-ethereum-account',
                assetId: 'ethereum:sepolia:eth',
                destinationAddress:
                  '0x2222222222222222222222222222222222222222',
                atomicUnits: '1000000000000000',
                maybeMessage: Option.none(),
              }),
            ),
          )
          yield* runtime.shutdown
          return submitted
        }),
      ),
    )

    expect(model.transaction._tag).toBe('SubmittedTransaction')
    expect(model.transactions.length).toBeGreaterThan(0)
  })
})
