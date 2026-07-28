import { Effect, Fiber } from 'effect'
import { Runtime } from 'foldkit'
import * as Program from 'foldkit/program'
import { describe, expect, test } from 'vitest'
import { WalletProgram, initialModel } from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import { makeWalletApplication } from './application.js'
import {
  WalletFoldkitRouteError,
  walletFoldkitStartForLocation,
  walletFoldkitStartForRelativePath,
} from './route.js'

const walletRouter = Program.makeRouter(WalletProgram)

describe('Wallet Foldkit route intake', () => {
  test('uses normal fresh startup at the root page', async () => {
    await expect(
      Effect.runPromise(walletFoldkitStartForLocation('/', '')),
    ).resolves.toStrictEqual(Runtime.fresh())
  })

  test('starts an inline State through exact Program restore behavior', async () => {
    const path = await Effect.runPromise(
      walletRouter.print(Program.state(initialModel)),
    )
    const start = await Effect.runPromise(
      walletFoldkitStartForRelativePath(path),
    )
    expect(start).toStrictEqual(Runtime.fromModel(initialModel))

    const root = document.createElement('div')
    root.id = 'wallet-state-route-test'
    document.body.append(root)
    const application = makeWalletApplication(
      root,
      SimulatedWalletResources,
      start,
    )
    const fiber = Effect.runFork(application.start())

    await expect
      .poll(() => document.body.textContent)
      .toContain('Simulated Sepolia Account')
    await Effect.runPromise(Fiber.interrupt(fiber))
    root.remove()
  })

  test('rejects inline Replay because the renderer cannot mount its controller', async () => {
    const tape = await Effect.runPromise(
      Effect.scoped(
        Runtime.recordReplayTape(WalletProgram, SimulatedWalletResources, []),
      ),
    )
    const path = await Effect.runPromise(
      walletRouter.print(Program.replay(tape, 0)),
    )

    await expect(
      Effect.runPromise(walletFoldkitStartForRelativePath(path)),
    ).rejects.toStrictEqual(
      new WalletFoldkitRouteError({
        message: `The Foldkit renderer cannot mount a ReplayController for selected frame 0 of ${tape.transitions.length.toString()}`,
      }),
    )
  })

  test('rejects SavedReplay without inventing a tape store', async () => {
    const path = '/wallet/replay/179f2ae7-8c0b-4e4f-8201-67a691732769?frame=4'

    await expect(
      Effect.runPromise(walletFoldkitStartForRelativePath(path)),
    ).rejects.toStrictEqual(
      new WalletFoldkitRouteError({
        message:
          'Saved replay 179f2ae7-8c0b-4e4f-8201-67a691732769 needs a ReplayTapeStore',
      }),
    )
  })
})
