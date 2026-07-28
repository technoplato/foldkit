import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { WalletProgram } from 'wallet-core-example'

import {
  WalletCliOperation,
  WalletTransferInput,
  defaultWalletChallengeInput,
  defaultWalletTransferInput,
  executeWalletCli,
  walletCliProgram,
} from './host.js'

describe('raw Wallet CLI host', () => {
  it('consumes the exact canonical Wallet Program export', () => {
    expect(walletCliProgram).toBe(WalletProgram)
  })

  it('awaits preview and challenge Command results', async () => {
    const preview = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          input: defaultWalletTransferInput,
        }),
      ),
    )
    const signature = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'SignChallenge',
          input: defaultWalletChallengeInput,
        }),
      ),
    )

    expect(preview.model.transaction._tag).toBe('PreviewedTransaction')
    expect(preview.progress).toContain('SucceededPreviewTransaction')
    expect(signature.model.signature._tag).toBe('SignedChallenge')
    expect(signature.progress).toContain('SucceededSignChallenge')
  })

  it('observes the transaction emitted by simulated submission', async () => {
    const execution = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Send',
          input: defaultWalletTransferInput,
        }),
      ),
    )

    expect(execution.model.transaction._tag).toBe('SubmittedTransaction')
    expect(execution.model.transactions.length).toBeGreaterThan(0)
    expect(execution.summary).toContain('Observed: yes')
    expect(execution.summary).not.toContain('Etherscan')
  })

  it('prints the shared network-specific address guidance', async () => {
    const failure = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          input: WalletTransferInput.make({
            ...defaultWalletTransferInput,
            destinationAddress:
              '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          }),
        }),
      ).pipe(Effect.flip),
    )

    expect(failure).toMatchObject({
      message: expect.stringContaining('That is not a valid Ethereum address.'),
    })
    expect(failure).toMatchObject({
      message: expect.stringContaining(
        '20 bytes encoded as 0x-prefixed hexadecimal.',
      ),
    })
  })

  it('inspects the portable replay path without executing historical Commands', async () => {
    const preview = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          input: defaultWalletTransferInput,
        }),
      ),
    )
    const replay = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'InspectReplay',
          maybeFrame: Option.none(),
        }),
        Option.some(preview.replayPath),
      ),
    )

    expect(replay.model).toStrictEqual(preview.model)
    expect(replay.summary).toContain('Replay frame')
  })
})
