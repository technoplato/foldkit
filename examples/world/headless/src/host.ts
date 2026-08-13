import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Console, Effect } from 'effect'
import { Runtime } from 'foldkit'
import { East, South } from 'foldkit/spatial'
import { PressedDigit, PressedEnter } from 'vending-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'
import {
  GotVendingMessage,
  Moved,
  PressedA,
  WorldProgram,
  asciiMap,
} from 'world-core-example'

const receiptPath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../receipt.json',
)

/** Walks to the machine, opens it, dials 1428, and writes a receipt. */
export const runHeadless = (): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: WorldProgram,
          resources: SimulatedWalletResources,
        }),
      )
      yield* runtime.initialization
      yield* runtime.run(Moved({ facing: East() }))
      yield* runtime.run(Moved({ facing: East() }))
      yield* runtime.run(Moved({ facing: South() }))
      const modelAfterWalk = yield* runtime.run(PressedA())
      const modelAfterCode =
        modelAfterWalk._tag === 'Operating'
          ? yield* runtime
              .run(
                GotVendingMessage({
                  message: PressedDigit.make({ digit: '1' }),
                }),
              )
              .pipe(
                Effect.flatMap(() =>
                  runtime.run(
                    GotVendingMessage({
                      message: PressedDigit.make({ digit: '4' }),
                    }),
                  ),
                ),
                Effect.flatMap(() =>
                  runtime.run(
                    GotVendingMessage({
                      message: PressedDigit.make({ digit: '2' }),
                    }),
                  ),
                ),
                Effect.flatMap(() =>
                  runtime.run(
                    GotVendingMessage({
                      message: PressedDigit.make({ digit: '8' }),
                    }),
                  ),
                ),
                Effect.flatMap(() =>
                  runtime.run(
                    GotVendingMessage({
                      message: PressedEnter.make({}),
                    }),
                  ),
                ),
              )
          : modelAfterWalk
      const receipt = {
        attention: modelAfterCode._tag,
        at: modelAfterCode.at,
        facing: modelAfterCode.facing._tag,
        map: asciiMap(modelAfterCode),
        vending:
          modelAfterCode._tag === 'Operating'
            ? {
                keypadBuffer: modelAfterCode.vending.keypadBuffer,
                vendPhase: modelAfterCode.vending.vendPhase._tag,
                listPriceDisplay: modelAfterCode.vending.listPriceDisplay,
              }
            : null,
        note: 'World headless used simulated wallet resources. No keys. No mainnet.',
      }
      const body = `${JSON.stringify(receipt, null, 2)}\n`
      mkdirSync(dirname(receiptPath), { recursive: true })
      writeFileSync(receiptPath, body)
      yield* Console.log(body)
      yield* runtime.shutdown
    }),
  )
