import { Effect } from 'effect'
import { Runtime } from 'foldkit'
import {
  type Digit,
  type Model,
  PressedClear,
  PressedDigit,
  PressedEnter,
  VendingProgram,
} from 'vending-core-example'
import {
  freshWalletHostOrigin,
  liveWalletRuntimeMode,
  projectReceivingQr,
} from 'wallet-qr-example'
import {
  makeWebWalletResources,
  walletDataSourceFromEnvironment,
} from 'wallet-web-client-example'

import { type VendingSceneState, createVendingScene } from './scene.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}
const hud = document.getElementById('hud')

const isDigit = (value: string): value is Digit =>
  value.length === 1 && value >= '0' && value <= '9'

const sceneStateFromModel = (model: Model): VendingSceneState => {
  const skuLabel =
    model.selection._tag === 'Locked' ? model.selection.sku.name : 'the clip'
  const address =
    model.selection._tag === 'Locked'
      ? model.selection.address
      : model.wallet._tag === 'ready'
        ? model.wallet.address
        : undefined
  let qrDataUrl: string | undefined
  if (model.wallet._tag === 'ready' && address !== undefined) {
    const wallet = model.wallet
    const account = wallet.portfolio.accounts.find(
      item => item.accountId === wallet.accountId,
    )
    const instruction = wallet.portfolio.receivingInstructions.find(
      item => item.assetId === 'solana:devnet:sol',
    )
    if (account !== undefined && instruction !== undefined) {
      const projection = projectReceivingQr({
        account,
        hostOrigin: freshWalletHostOrigin,
        instruction,
        portfolio: wallet.portfolio,
        runtimeMode: liveWalletRuntimeMode,
      })
      if (projection._tag === 'AvailableReceivingQr') {
        qrDataUrl = projection.dataUrl
      }
    }
  }
  return {
    digits: model.keypadBuffer,
    skuLabel,
    listPriceDisplay: model.listPriceDisplay,
    vendPhase: model.vendPhase._tag,
    address,
    qrDataUrl,
    incomingCount: model.incoming.length,
  }
}

const paintHud = (state: VendingSceneState, viewMode: string) => {
  if (hud === null) {
    return
  }
  const viewNote = viewMode === 'final' ? '' : `<br>view ${viewMode}`
  hud.innerHTML = `knophy vending · ${state.skuLabel} · listed ${state.listPriceDisplay}<br>phase ${state.vendPhase} · dial 1428 then ENT${
    state.address === undefined ? '' : `<code>${state.address}</code>`
  }${viewNote}`
}

const dataSource = walletDataSourceFromEnvironment(
  import.meta.env['VITE_WALLET_DATA_SOURCE'],
)

const start = Effect.gen(function* () {
  const runtime = yield* Effect.orDie(
    Runtime.makeProgramRuntime({
      program: VendingProgram,
      resources: makeWebWalletResources(dataSource),
    }),
  )
  yield* runtime.initialization
  const scene = createVendingScene(root, {
    onDigit: digit => {
      if (isDigit(digit)) {
        runtime.send(PressedDigit.make({ digit }))
      }
    },
    onEnter: () => {
      runtime.send(PressedEnter.make({}))
    },
    onClear: () => {
      runtime.send(PressedClear.make({}))
    },
  })
  const sync = (model: Model) => {
    const state = sceneStateFromModel(model)
    scene.syncState(state)
    paintHud(state, scene.viewMode)
  }
  sync(runtime.readModel())
  runtime.observeModel(sync)
  yield* Effect.never
})

Effect.runFork(Effect.scoped(start))
