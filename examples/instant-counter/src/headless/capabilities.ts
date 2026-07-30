import { Duration, Effect, Layer, Match as M, Option } from 'effect'
import { Processor } from 'foldkit'

import {
  EffectExecutionError,
  EffectExecutor,
  type EffectExecutorService,
  effectIdForKind,
} from '../domain/effect.js'

const timerCapability = Processor.Capability.make({
  id: Processor.CapabilityId.make(['Background', 'Timer', 'Schedule']),
  version: 1,
})

const timerEffectSupport = Processor.EffectSupportRange.make({
  id: effectIdForKind('BackgroundTimer'),
  maximumVersion: 1,
  minimumVersion: 1,
})

/** Builds the Descriptor for the renderer-free headless Processor. */
export const headlessProcessorDescriptor = (
  clientId: string,
  processorId: string,
): Processor.Descriptor =>
  Processor.Descriptor.make({
    capabilities: [timerCapability],
    clientId,
    effectSupport: [timerEffectSupport],
    processorId,
    protocol: Processor.ProtocolRange.make({
      maximumVersion: 1,
      minimumVersion: 1,
    }),
  })

const executor = (processorId: string): EffectExecutorService => ({
  perform: request =>
    M.value(request.kind).pipe(
      M.withReturnType<
        Effect.Effect<
          Readonly<{ processorId: string; summary: string }>,
          EffectExecutionError
        >
      >(),
      M.when('BackgroundTimer', () => {
        const milliseconds = Option.getOrElse(request.durationMs, () => 1_500)
        return Effect.sleep(Duration.millis(milliseconds)).pipe(
          Effect.as({
            processorId,
            summary: `Completed a ${milliseconds.toString()} ms headless timer.`,
          }),
        )
      }),
      M.orElse(() =>
        Effect.fail(
          new EffectExecutionError({
            processorId,
            reason: `${request.kind} is not implemented by the headless Processor.`,
          }),
        ),
      ),
    ),
})

/** Provides the finite effects implemented by the headless Processor. */
export const headlessEffectExecutorLayer = (
  processorId: string,
): Layer.Layer<EffectExecutor> =>
  Layer.succeed(EffectExecutor, executor(processorId))
