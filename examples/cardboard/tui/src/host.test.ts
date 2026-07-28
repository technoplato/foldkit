import {
  AdvancedCardboardSequence,
  CardboardProgram,
  CardboardRouter,
  initialCardboardRoute,
} from 'cardboard-core-example'
import { Array, Effect, Layer, Option } from 'effect'
import { Program, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { parseCardboardTuiRoute } from './host.js'

describe('Cardboard TUI replay carrier', () => {
  it('opens the exact selected replay frame from an absolute carrier', async () => {
    const portableReplayPath = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const controller = yield* Runtime.makeReplayController({
            program: CardboardProgram,
            resources: Layer.empty,
            route: initialCardboardRoute,
          })
          yield* controller.initialization
          yield* controller.run(AdvancedCardboardSequence())
          const replayPath = yield* CardboardRouter.print(
            Program.replay(controller.readReplayTape(), 1),
          )
          yield* controller.shutdown
          return replayPath
        }),
      ),
    )
    const route = await Effect.runPromise(
      parseCardboardTuiRoute(
        `https://cardboard.knophy.com${portableReplayPath}`,
      ),
    )

    expect(route._tag).toBe('Replay')
    if (route._tag !== 'Replay') {
      throw new Error('Expected the TUI to parse an inline replay')
    }
    expect(route.frame).toBe(1)
    expect(route.tape.transitions).toHaveLength(1)
    expect(
      Option.getOrThrow(Array.head(route.tape.transitions)).message._tag,
    ).toBe('AdvancedCardboardSequence')
  })
})
