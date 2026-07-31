import { Context, Data, Effect, Match as M, Option } from 'effect'
import * as Command from 'foldkit/command'
import * as Processor from 'foldkit/processor'

import {
  type EffectRequestKind,
  FailedEffect,
  RequestedEffect,
  SucceededEffect,
} from './message.js'

/** A host-side effect failed with a sanitized, replay-safe explanation. */
export class EffectExecutionError extends Data.TaggedError(
  'EffectExecutionError',
)<{
  readonly processorId: string
  readonly reason: string
}> {}

/** The public outcome returned by a selected Processor. */
export type EffectExecution = Readonly<{
  processorId: string
  summary: string
}>

/** Host-owned implementations for finite capability-driven effects. */
export type EffectExecutorService = Readonly<{
  perform: (
    request: RequestedEffect,
  ) => Effect.Effect<EffectExecution, EffectExecutionError>
}>

/** Host-owned implementations for finite capability-driven effects. */
export class EffectExecutor extends Context.Service<
  EffectExecutor,
  EffectExecutorService
>()('InstantCounter/EffectExecutor') {}

const capabilityForKind = (kind: EffectRequestKind): Processor.CapabilityId =>
  M.value(kind).pipe(
    M.withReturnType<Processor.CapabilityId>(),
    M.when('Vibration', () =>
      Processor.CapabilityId.make(['Device', 'Haptics', 'Vibrate']),
    ),
    M.when('CameraCapture', () =>
      Processor.CapabilityId.make(['Device', 'Camera', 'Capture']),
    ),
    M.when('DeviceTimer', () =>
      Processor.CapabilityId.make(['Device', 'Timer', 'Schedule']),
    ),
    M.when('BackgroundTimer', () =>
      Processor.CapabilityId.make(['Background', 'Timer', 'Schedule']),
    ),
    M.when(
      'AudioTranscription',
      () => Processor.Audio.FiniteTranscriptionCapabilityId,
    ),
    M.when('SpeakerDiarization', () => Processor.Audio.DiarizationCapabilityId),
    M.when(
      'MusicIdentification',
      () => Processor.Audio.MusicIdentificationCapabilityId,
    ),
    M.when(
      'LyricsResolution',
      () => Processor.Audio.LyricsResolutionCapabilityId,
    ),
    M.when(
      'AmbientSoundRecognition',
      () => Processor.Audio.SoundClassificationCapabilityId,
    ),
    M.when('AppleSpeechRecognition', () =>
      Processor.CapabilityId.make(['Apple', 'Speech', 'Recognize']),
    ),
    M.when('AppleSoundRecognition', () =>
      Processor.CapabilityId.make(['Apple', 'Sound', 'Recognize']),
    ),
    M.when('TextTranslation', () => Processor.Audio.TranslationCapabilityId),
    M.when(
      'AcousticAnalysis',
      () => Processor.Audio.AcousticAnalysisCapabilityId,
    ),
    M.exhaustive,
  )

/** Returns the nested Processor capability required for one effect kind. */
export const requiredCapabilityForKind = (
  kind: EffectRequestKind,
): Processor.CapabilityId => capabilityForKind(kind)

/** Returns the stable portable effect identifier for one request kind. */
export const effectIdForKind = (kind: EffectRequestKind): string =>
  `Foldkit.Example.InstantCounter.${kind}`

const PerformRequestedEffect = Command.define(
  'PerformRequestedEffect',
  {
    durationMs: RequestedEffect.fields.durationMs,
    kind: RequestedEffect.fields.kind,
    requestId: RequestedEffect.fields.requestId,
  },
  SucceededEffect,
  FailedEffect,
)(request =>
  Effect.flatMap(EffectExecutor, executor =>
    executor.perform(RequestedEffect(request)),
  ).pipe(
    Effect.map(({ processorId, summary }) =>
      SucceededEffect({ ...request, processorId, summary }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedEffect({
          kind: request.kind,
          processorId: error.processorId,
          reason: error.reason,
          requestId: request.requestId,
        }),
      ),
    ),
  ),
)

const resultEventRange = (eventId: string) =>
  Command.ResultEventRange.make({
    eventId,
    maximumVersion: 1,
    minimumVersion: 1,
  })

/** Builds the inert manifested Command scheduled by every receiving Processor. */
export const commandForEffect = (message: RequestedEffect) =>
  Command.withEffectManifest(
    PerformRequestedEffect({
      durationMs: message.durationMs,
      kind: message.kind,
      requestId: message.requestId,
    }),
    Command.EffectManifest.make({
      formatVersion: 2,
      id: effectIdForKind(message.kind),
      permittedResultEvents: [
        resultEventRange('InstantCounter.SucceededEffect'),
        resultEventRange('InstantCounter.FailedEffect'),
      ],
      placement: Processor.Placement.make({
        affinity: Processor.OriginClient.make({}),
        capability: Processor.CapabilityRequirement.make({
          id: capabilityForKind(message.kind),
          minimumVersion: 1,
        }),
        cardinality: 'One',
        unavailable: 'UseAnyCapable',
        version: 1,
      }),
      publicArguments: {
        durationMs: Option.getOrNull(message.durationMs),
        kind: message.kind,
        requestId: message.requestId,
      },
      version: 1,
    }),
  )
