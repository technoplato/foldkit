import { Effect, Option } from 'effect'
import { EffectExecutor, RequestedEffect } from 'instant-counter-example/domain'
import { describe, expect, it } from 'vitest'

import {
  makeNativeEffectExecutorLayer,
  makeNativeProcessorDescriptor,
} from './nativeHost'

describe('native Processor host', () => {
  it('advertises no capabilities or effect support', () => {
    const descriptor = makeNativeProcessorDescriptor('client-1', 'processor-1')

    expect(descriptor.capabilities).toStrictEqual([])
    expect(descriptor.effectSupport).toBeUndefined()
  })

  it('fails every effect with one sanitized unsupported reason', async () => {
    const requestId = 'secret-request-id'
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const executor = yield* EffectExecutor
        return yield* Effect.flip(
          executor.perform(
            RequestedEffect({
              durationMs: Option.none(),
              kind: 'CameraCapture',
              requestId,
            }),
          ),
        )
      }).pipe(Effect.provide(makeNativeEffectExecutorLayer('processor-1'))),
    )

    expect(failure.processorId).toBe('processor-1')
    expect(failure.reason).toBe(
      'This native Processor does not implement portable effects.',
    )
    expect(failure.reason).not.toContain(requestId)
  })
})
