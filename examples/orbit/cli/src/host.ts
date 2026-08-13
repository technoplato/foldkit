import { OrbitProgram, emptyModel, playOf, runIndex } from 'orbit-core-example'
import { Console, Effect } from 'effect'
import { Runtime } from 'foldkit'

import { orbitResources } from './resources.js'

/** Runs the index through the renderer-free runtime and returns balances. */
export const executeIndex = (): Effect.Effect<{
  readonly tortoise: number
  readonly achilles: number
  readonly ok: boolean
  readonly seq: number
}> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: OrbitProgram,
          resources: orbitResources(),
        }),
      )
      yield* runtime.initialization
      const model = runtime.readModel()
      yield* runtime.shutdown
      return {
        tortoise: playOf(model.sims.tortoise),
        achilles: playOf(model.sims.achilles),
        ok: model.steps.every(step => step.ok),
        seq: model.seq,
      }
    }),
  )

/** Prints index receipt from the same core used by Foldkit. */
export const runCli = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    const result = yield* executeIndex()
    const { receipt } = runIndex(emptyModel())
    yield* Console.log(`ok=${String(result.ok && receipt.ok)} seq=${String(result.seq)}`)
    yield* Console.log(`tortoise=${String(result.tortoise)} achilles=${String(result.achilles)}`)
  })
