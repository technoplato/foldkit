import { Effect, Option } from 'effect'
import { Runtime } from 'foldkit'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'
import {
  type Model,
  WorldProgram,
  messageFromKey,
} from 'world-core-example'

import { viewModeFromLocation } from './image.js'
import { paintHud, paintOverlay } from './overlay.js'
import { createWorldScene } from './scene.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

const viewMode = viewModeFromLocation(window.location)

const start = Effect.gen(function* () {
  const runtime = yield* Effect.orDie(
    Runtime.makeProgramRuntime({
      program: WorldProgram,
      resources: SimulatedWalletResources,
    }),
  )
  yield* runtime.initialization
  const scene = createWorldScene(root, viewMode)
  const paint = (model: Model) => {
    scene.syncState(model)
    paintOverlay(model)
    paintHud(model, viewMode)
  }
  paint(runtime.readModel())
  runtime.observeModel(paint)
  window.addEventListener('keydown', event => {
    const maybeMessage = messageFromKey(event.key, runtime.readModel())
    if (Option.isNone(maybeMessage)) {
      return
    }
    event.preventDefault()
    runtime.send(maybeMessage.value)
  })
  yield* Effect.never
})

Effect.runFork(Effect.scoped(start))
