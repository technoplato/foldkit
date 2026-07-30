import { Effect, Option } from 'effect'
import * as Runtime from 'foldkit/program-runtime'
import { describe, expect, it } from 'vitest'
import { walletCliProgram } from 'wallet-cli-example'
import { TransferRequest, WalletProgram } from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'
import { walletOpenTuiProgram } from 'wallet-tui-example/presentation'

import {
  actionForWalletTerminalInput,
  renderWalletTerminal,
  sendWalletTransaction,
  walletTerminalProgram,
} from './host.js'

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
      frame: 1,
      finalFrame: 1,
      maybeNotice: Option.none(),
      inputMode: 'Actions',
    })

    expect(screen).toContain('[s] Show')
    expect(screen).toContain(
      'Send network: simulated-ethereum-account · ETH · Ethereum Sepolia',
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
