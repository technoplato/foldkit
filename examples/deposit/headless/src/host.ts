import {
  DepositProgram,
  type Model,
  RequestedTestFunding,
} from 'deposit-core-example'
import { Console, Duration, Effect, Layer, Option } from 'effect'
import { Runtime } from 'foldkit'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
          program: DepositProgram,
          resources,
        }),
      )
      yield* runtime.initialization
      let model = yield* waitForWallet(() => runtime.readModel(), 40)
      if (model.wallet._tag === 'ready') {
        model = yield* runtime.run(RequestedTestFunding.make({}))
        yield* Effect.sleep(Duration.seconds(8))
        model = runtime.readModel()
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
      ? 'Foldkit preview and this headless run use Live SOL Devnet.'
      : 'Headless used simulated resources. Foldkit Live is the real SOL path.',
  wallet: model.wallet._tag,
  address: model.wallet._tag === 'ready' ? model.wallet.address : null,
  accountId: model.wallet._tag === 'ready' ? model.wallet.accountId : null,
  incoming: model.incoming.map(item => ({
    transactionId: item.transactionId,
    lamports: item.lamports,
    sol: item.lamports,
    status: item.status,
  })),
  funding: model.funding,
  unlocked: model.sender.unlocked.map(item => item._tag),
  lastOutcome: Option.match(model.lastOutcome, {
    onNone: () => null,
    onSome: value => value,
  }),
})

/** Runs Deposit headless: print SOL receive JSON, watch Incoming, write a receipt. */
export const runHeadless = (): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const live = yield* runWithResources('Live', MacOSLiveWalletResources).pipe(
      Effect.timeout('8 seconds'),
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
