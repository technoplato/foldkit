import { Effect, Layer } from 'effect'
import * as Processor from 'foldkit/processor'
import {
  EffectExecutionError,
  EffectExecutor,
  type EffectExecutorService,
} from 'instant-counter-example/domain'

const unsupportedEffectReason =
  'This native Processor does not implement portable effects.'

/** Builds the capability-free Descriptor for the native counter Processor. */
export const makeNativeProcessorDescriptor = (
  clientId: string,
  processorId: string,
): Processor.Descriptor =>
  Processor.Descriptor.make({
    capabilities: [],
    clientId,
    processorId,
    protocol: Processor.ProtocolRange.make({
      maximumVersion: 1,
      minimumVersion: 1,
    }),
  })

const makeUnsupportedEffectExecutor = (
  processorId: string,
): EffectExecutorService => ({
  perform: () =>
    Effect.fail(
      new EffectExecutionError({
        processorId,
        reason: unsupportedEffectReason,
      }),
    ),
})

/** Provides an executor that always returns one sanitized unsupported error. */
export const makeNativeEffectExecutorLayer = (
  processorId: string,
): Layer.Layer<EffectExecutor> =>
  Layer.succeed(EffectExecutor, makeUnsupportedEffectExecutor(processorId))
