import { Effect, Layer } from 'effect'
import { Program, Runtime } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { FactClient } from './factClient.js'
import { ClickedLoadFact } from './message.js'
import { Fact, Loaded } from './model.js'
import { FactProgram } from './program.js'

describe('Fact Program replay', () => {
  it.effect(
    'keeps historical requests inert and runs a new request after branching live',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          let requestCount = 0
          const resources = Layer.succeed(FactClient, {
            fetch: Effect.sync(() => {
              requestCount += 1
              return Fact.make({
                requestId: `request-${requestCount.toString()}`,
                text: `Fact ${requestCount.toString()}`,
              })
            }),
          })
          const tape = yield* Runtime.recordReplayTape(FactProgram, resources, [
            ClickedLoadFact(),
          ])

          expect(requestCount).toBe(1)
          expect(
            tape.transitions.map(transition => transition.message._tag),
          ).toStrictEqual(['ClickedLoadFact', 'SucceededFetchFact'])

          const controller = yield* Runtime.makeReplayController({
            program: FactProgram,
            resources,
            route: Program.replay(tape),
          })
          yield* controller.seek(0)
          yield* controller.seek(1)
          yield* controller.seek(2)

          expect(requestCount).toBe(1)
          const model = yield* controller.run(ClickedLoadFact())

          expect(requestCount).toBe(2)
          expect(model).toStrictEqual(
            Loaded.make({
              fact: Fact.make({ requestId: 'request-2', text: 'Fact 2' }),
            }),
          )
          expect(
            controller
              .readReplayTape()
              .transitions.map(transition => transition.message._tag),
          ).toStrictEqual([
            'ClickedLoadFact',
            'SucceededFetchFact',
            'ClickedLoadFact',
            'SucceededFetchFact',
          ])
        }),
      ),
  )
})
