import * as Counter from 'counter-core-example'
import {
  ClickedAddCounter,
  GotCounterMessage,
  MultipleCountersProgram,
  type Model,
} from 'counters-core-example'
import { Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'

import { createCountersScene } from './scene.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

const rowsFromModel = (model: Model) =>
  model.rows.map(row => ({ id: row.id, count: row.counter.count }))

const nextCounterId = (model: Model): string => {
  const used = new Set(model.rows.map(row => row.id))
  for (const retired of model.retiredCounterIds) {
    used.add(retired)
  }
  let index = model.rows.length + 1
  let candidate = `counter-${String(index)}`
  while (used.has(candidate)) {
    index += 1
    candidate = `counter-${String(index)}`
  }
  return candidate
}

const start = Effect.gen(function* () {
  const runtime = yield* Effect.orDie(
    Runtime.makeProgramRuntime({
      program: MultipleCountersProgram,
      resources: Layer.empty,
    }),
  )
  yield* runtime.initialization
  const scene = createCountersScene(root, {
    onIncrement: counterId => {
      runtime.send(
        GotCounterMessage({
          counterId,
          message: Counter.Increment(),
        }),
      )
    },
    onDecrement: counterId => {
      runtime.send(
        GotCounterMessage({
          counterId,
          message: Counter.Decrement(),
        }),
      )
    },
    onAdd: () => {
      runtime.send(
        ClickedAddCounter({ counterId: nextCounterId(runtime.readModel()) }),
      )
    },
  })
  scene.syncState({ rows: rowsFromModel(runtime.readModel()) })
  runtime.observeModel(model => {
    scene.syncState({ rows: rowsFromModel(model) })
  })
  yield* Effect.never
})

Effect.runFork(Effect.scoped(start))
