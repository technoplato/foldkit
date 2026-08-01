import { Array, Duration, Effect, Layer, Match as M, Option } from 'effect'
import { Processor } from 'foldkit'

import { instantProgramProtocolVersion } from '@foldkit/instant'

import {
  EffectExecutionError,
  EffectExecutor,
  type EffectExecutorService,
  effectIdForKind,
} from '../domain/effect.js'
import type { EffectRequestKind, RequestedEffect } from '../domain/message.js'

const capability = (id: Processor.CapabilityId): Processor.Capability =>
  Processor.Capability.make({
    id,
    version: 1,
  })

const effectSupport = (kind: EffectRequestKind): Processor.EffectSupportRange =>
  Processor.EffectSupportRange.make({
    id: effectIdForKind(kind),
    maximumVersion: 1,
    minimumVersion: 1,
  })

const supportsVibration = (): boolean => typeof navigator.vibrate === 'function'

const supportsCamera = (): boolean =>
  navigator.mediaDevices?.getUserMedia !== undefined

/** Discovers the finite capabilities implemented by this browser Client. */
export const browserCapabilities = (): ReadonlyArray<Processor.Capability> => {
  const capabilities = [
    capability(Processor.CapabilityId.make(['Device', 'Timer', 'Schedule'])),
  ]
  const withVibration = supportsVibration()
    ? Array.append(
        capabilities,
        capability(
          Processor.CapabilityId.make(['Device', 'Haptics', 'Vibrate']),
        ),
      )
    : capabilities
  return supportsCamera()
    ? Array.append(
        withVibration,
        capability(
          Processor.CapabilityId.make(['Device', 'Camera', 'Capture']),
        ),
      )
    : withVibration
}

const supportedKinds = (): ReadonlyArray<EffectRequestKind> => {
  const kinds: ReadonlyArray<EffectRequestKind> = ['DeviceTimer']
  const vibrationKind: EffectRequestKind = 'Vibration'
  const cameraCaptureKind: EffectRequestKind = 'CameraCapture'
  const withVibration = supportsVibration()
    ? Array.append(kinds, vibrationKind)
    : kinds
  return supportsCamera()
    ? Array.append(withVibration, cameraCaptureKind)
    : withVibration
}

/** Builds the advertised Descriptor for one browser-hosted Processor. */
export const browserProcessorDescriptor = (
  clientId: string,
  processorId: string,
): Processor.Descriptor =>
  Processor.Descriptor.make({
    capabilities: browserCapabilities(),
    clientId,
    effectSupport: Array.map(supportedKinds(), effectSupport),
    processorId,
    protocol: Processor.ProtocolRange.make({
      maximumVersion: instantProgramProtocolVersion,
      minimumVersion: instantProgramProtocolVersion,
    }),
  })

const unsupported = (
  processorId: string,
  request: RequestedEffect,
): Effect.Effect<never, EffectExecutionError> =>
  Effect.fail(
    new EffectExecutionError({
      processorId,
      reason: `${request.kind} is not implemented by this browser Processor.`,
    }),
  )

const performVibration = (
  processorId: string,
): Effect.Effect<
  Readonly<{ processorId: string; summary: string }>,
  EffectExecutionError
> => {
  if (!supportsVibration()) {
    return Effect.fail(
      new EffectExecutionError({
        processorId,
        reason: 'Vibration is unavailable in this browser.',
      }),
    )
  }
  return Effect.sync(() => {
    navigator.vibrate([120, 80, 120])
    return {
      processorId,
      summary: 'Completed a two-pulse vibration.',
    }
  })
}

const performCameraCapture = (
  processorId: string,
): Effect.Effect<
  Readonly<{ processorId: string; summary: string }>,
  EffectExecutionError
> => {
  if (!supportsCamera()) {
    return Effect.fail(
      new EffectExecutionError({
        processorId,
        reason: 'Camera capture is unavailable in this browser.',
      }),
    )
  }
  return Effect.tryPromise({
    try: () =>
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        Array.forEach(Array.fromIterable(stream.getTracks()), track =>
          track.stop(),
        )
        return {
          processorId,
          summary: 'Opened the camera and completed a privacy-safe probe.',
        }
      }),
    catch: () =>
      new EffectExecutionError({
        processorId,
        reason: 'Camera permission was denied or capture failed.',
      }),
  })
}

const performTimer = (
  processorId: string,
  durationMs: Option.Option<number>,
): Effect.Effect<Readonly<{ processorId: string; summary: string }>, never> => {
  const milliseconds = Option.getOrElse(durationMs, () => 1_500)
  return Effect.sleep(Duration.millis(milliseconds)).pipe(
    Effect.as({
      processorId,
      summary: `Completed a ${milliseconds.toString()} ms device timer.`,
    }),
  )
}

const browserExecutor = (processorId: string): EffectExecutorService => ({
  perform: request =>
    M.value(request.kind).pipe(
      M.withReturnType<
        Effect.Effect<
          Readonly<{ processorId: string; summary: string }>,
          EffectExecutionError
        >
      >(),
      M.when('Vibration', () => performVibration(processorId)),
      M.when('CameraCapture', () => performCameraCapture(processorId)),
      M.when('DeviceTimer', () =>
        performTimer(processorId, request.durationMs),
      ),
      M.when('BackgroundTimer', () => unsupported(processorId, request)),
      M.orElse(() => unsupported(processorId, request)),
    ),
})

/** Provides this browser's finite effect implementations to a Foldkit runtime. */
export const browserEffectExecutorLayer = (
  processorId: string,
): Layer.Layer<EffectExecutor> =>
  Layer.succeed(EffectExecutor, browserExecutor(processorId))
