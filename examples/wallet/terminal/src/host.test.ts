import { Effect, Option } from 'effect'
import * as Runtime from 'foldkit/program-runtime'
import { describe, expect, it } from 'vitest'
import { walletCliProgram } from 'wallet-cli-example'
import { WalletProgram } from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'
import { walletOpenTuiProgram } from 'wallet-tui-example/presentation'

import {
  actionForWalletTerminalInput,
  renderWalletTerminal,
  sendSimulatedWalletTransaction,
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
    })

    expect(screen).toContain('[s] Show')
    expect(screen).toContain('[r] Receive')
    expect(screen).toContain('[p] Preview')
    expect(screen).toContain('[n] Send')
    expect(screen).toContain('[c] Sign challenge')
    expect(actionForWalletTerminalInput('left')).toStrictEqual(
      Option.some('InspectPrevious'),
    )
    expect(actionForWalletTerminalInput('q')).toStrictEqual(Option.some('Quit'))
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
          const submitted = yield* sendSimulatedWalletTransaction(runtime)
          yield* runtime.shutdown
          return submitted
        }),
      ),
    )

    expect(model.transaction._tag).toBe('SubmittedTransaction')
    expect(model.observedTransactions).toHaveLength(1)
  })
})
