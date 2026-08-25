import {
  CounterFactOpening,
  type InteractionIdentitySource,
  type Message,
  MultipleCountersProgram,
  OpenedNavigation,
  StaticCounterFactClient,
  pathToNavigationTarget,
} from 'counters-core-example'
import { Array, Effect, Option } from 'effect'
import { Runtime } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import { bootMessageForTarget, enqueueBootMessage } from './client.js'

const identitySource: InteractionIdentitySource = {
  counterDetailPresentationId: () => 'detail-boot-1',
  counterFactRequestId: () => 'fact-boot-1',
  counterId: () => 'counter-boot-1',
  deleteCounterConfirmationId: () => 'delete-boot-1',
}

const parsedDeepTarget = pathToNavigationTarget(
  'https://counters.test/counters/counter-1/fact',
)
if (parsedDeepTarget._tag !== 'CounterFactTarget') {
  throw new Error('Expected a Counter fact target')
}
const deepTarget = parsedDeepTarget

describe('Multiple Counters OpenTUI boot navigation', () => {
  it('enqueues a deep carrier as one canonical Program Message', () => {
    const sendMessage = vi.fn<(message: Message) => void>()

    enqueueBootMessage(
      bootMessageForTarget(deepTarget, identitySource),
      sendMessage,
    )

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith(
      OpenedNavigation({
        opening: CounterFactOpening.make({
          presentationId: 'detail-boot-1',
          requestId: 'fact-boot-1',
          target: deepTarget,
        }),
      }),
    )
  })

  it('records boot navigation in the Program journal and replay tape', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: MultipleCountersProgram,
            resources: StaticCounterFactClient,
          })
          yield* runtime.initialization
          const message = bootMessageForTarget(deepTarget, identitySource)

          runtime.send(message)

          const maybeTransition = Array.head(runtime.journal.read().transitions)
          expect(Option.isSome(maybeTransition)).toBe(true)
          if (Option.isNone(maybeTransition)) {
            throw new Error('Expected one boot navigation transition')
          }
          expect(maybeTransition.value.message).toStrictEqual(message)
          expect(runtime.replay.readTape().transitions).toHaveLength(1)
          expect(runtime.readModel().navigation).toMatchObject({
            _tag: 'CounterDetail',
            counterId: 'counter-1',
            presentationId: 'detail-boot-1',
            maybeMode: {
              _tag: 'Some',
              value: {
                _tag: 'CounterFactAlert',
                requestId: 'fact-boot-1',
              },
            },
          })
        }),
      ),
    )
  })
})
