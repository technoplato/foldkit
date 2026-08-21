import { Console, Duration, Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type Model,
  PressedDigit,
  PressedEnter,
  ReportedVendTimeout,
  VendingProgram,
} from 'vending-core-example'
import type { WalletResources } from 'wallet-core-example'
import { MacOSLiveWalletResources } from 'wallet-node-client-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

const receiptPath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../receipt.json',
)

const waitForWallet = (
  readModel: () => Model,
  attempts: number,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let remaining = attempts
    while (remaining > 0) {
      const model = readModel()
      if (model.wallet._tag === 'ready' || model.wallet._tag === 'failed') {
        return model
      }
      yield* Effect.sleep(Duration.millis(250))
      remaining -= 1
    }
    return readModel()
  })

const waitForVend = (
  readModel: () => Model,
  attempts: number,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let remaining = attempts
    while (remaining > 0) {
      const model = readModel()
      if (
        model.vendPhase._tag === 'Dispensed' ||
        model.vendPhase._tag === 'TimedOut'
      ) {
        return model
      }
      yield* Effect.sleep(Duration.millis(500))
      remaining -= 1
    }
    return readModel()
  })

const runWithResources = (
  label: 'Live' | 'Simulated',
  resources: Layer.Layer<WalletResources>,
): Effect.Effect<{
  readonly source: 'Live' | 'Simulated'
  readonly model: Model
}> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: VendingProgram,
          resources,
        }),
      )
      yield* runtime.initialization
      let model = yield* waitForWallet(() => runtime.readModel(), 40)
      if (model.wallet._tag === 'ready') {
        model = yield* runtime.run(PressedDigit.make({ digit: '1' }))
        model = yield* runtime.run(PressedDigit.make({ digit: '4' }))
        model = yield* runtime.run(PressedDigit.make({ digit: '2' }))
        model = yield* runtime.run(PressedDigit.make({ digit: '8' }))
        model = yield* runtime.run(PressedEnter.make({}))
        yield* Console.log(
          JSON.stringify(
            {
              source: label,
              wallet: model.wallet._tag,
              address:
                model.wallet._tag === 'ready' ? model.wallet.address : null,
              vendPhase: model.vendPhase._tag,
              sku: '1428',
            },
            null,
            2,
          ),
        )
        model = yield* waitForVend(() => runtime.readModel(), 40)
        if (model.vendPhase._tag === 'AwaitingPayment') {
          model = yield* runtime.run(ReportedVendTimeout.make({}))
        }
      }
      yield* runtime.shutdown
      return { source: label, model }
    }),
  )

const publicReceipt = (
  source: 'Live' | 'Simulated',
  model: Model,
): unknown => ({
  source,
  note:
    source === 'Live'
      ? 'Three host at vending.knophy.com and this headless run use Live SOL Devnet.'
      : 'Headless used simulated resources. The Three host is the real SOL path.',
  wallet: model.wallet._tag,
  address: model.wallet._tag === 'ready' ? model.wallet.address : null,
  accountId: model.wallet._tag === 'ready' ? model.wallet.accountId : null,
  vendPhase: model.vendPhase._tag,
  selection: model.selection._tag,
  listPriceDisplay: model.listPriceDisplay,
  settleLamports: model.settleLamports.toString(),
  incoming: model.incoming.map(item => ({
    transactionId: item.transactionId,
    lamports: item.lamports,
    status: item.status,
  })),
})

/** Runs Vending headless: print SOL receive JSON, watch Incoming, write a receipt. */
export const runHeadless = (): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const live = yield* runWithResources('Live', MacOSLiveWalletResources).pipe(
      Effect.timeout('60 seconds'),
      Effect.option,
    )
    const used =
      live._tag === 'Some' && live.value.model.wallet._tag === 'ready'
        ? live.value
        : yield* runWithResources('Simulated', SimulatedWalletResources)
    const body = `${JSON.stringify(publicReceipt(used.source, used.model), null, 2)}\n`
    mkdirSync(dirname(receiptPath), { recursive: true })
    writeFileSync(receiptPath, body)
    yield* Console.log(body)
  })
