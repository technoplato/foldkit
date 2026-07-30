import { CounterProgram } from 'counter-core-example'
import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

/** Every portable capability request exposed by the Instant counter. */
export const EffectRequestKind = S.Literals([
  'Vibration',
  'CameraCapture',
  'DeviceTimer',
  'BackgroundTimer',
  'AudioTranscription',
  'SpeakerDiarization',
  'MusicIdentification',
  'LyricsResolution',
  'AmbientSoundRecognition',
  'AppleSpeechRecognition',
  'AppleSoundRecognition',
  'TextTranslation',
  'AcousticAnalysis',
])

/** Every portable capability request exposed by the Instant counter. */
export type EffectRequestKind = typeof EffectRequestKind.Type

/** Records a request for one capability-driven side effect. */
export const RequestedEffect = m('RequestedEffect', {
  durationMs: S.OptionFromNullOr(S.Int),
  kind: EffectRequestKind,
  requestId: S.String,
})
/** Records a request for one capability-driven side effect. */
export type RequestedEffect = typeof RequestedEffect.Type

/** Records that the acceptance authority delegated an effect to one Processor. */
export const AssignedEffect = m('AssignedEffect', {
  kind: EffectRequestKind,
  processorId: S.String,
  requestId: S.String,
})
/** Records that the acceptance authority delegated an effect to one Processor. */
export type AssignedEffect = typeof AssignedEffect.Type

/** Records that no currently live Processor can handle an effect. */
export const WaitedForEffectProcessor = m('WaitedForEffectProcessor', {
  kind: EffectRequestKind,
  requestId: S.String,
})
/** Records that no currently live Processor can handle an effect. */
export type WaitedForEffectProcessor = typeof WaitedForEffectProcessor.Type

/** Records that an effect placement policy rejected the request. */
export const RejectedEffect = m('RejectedEffect', {
  kind: EffectRequestKind,
  reason: S.String,
  requestId: S.String,
})
/** Records that an effect placement policy rejected the request. */
export type RejectedEffect = typeof RejectedEffect.Type

/** Records a successfully completed delegated side effect. */
export const SucceededEffect = m('SucceededEffect', {
  kind: EffectRequestKind,
  processorId: S.String,
  requestId: S.String,
  summary: S.String,
})
/** Records a successfully completed delegated side effect. */
export type SucceededEffect = typeof SucceededEffect.Type

/** Records a failed delegated side effect without retaining host error objects. */
export const FailedEffect = m('FailedEffect', {
  kind: EffectRequestKind,
  processorId: S.String,
  reason: S.String,
  requestId: S.String,
})
/** Records a failed delegated side effect without retaining host error objects. */
export type FailedEffect = typeof FailedEffect.Type

/** Every Message accepted by the shared Instant counter Program. */
export const Message = S.Union([
  CounterProgram.Message,
  RequestedEffect,
  AssignedEffect,
  WaitedForEffectProcessor,
  RejectedEffect,
  SucceededEffect,
  FailedEffect,
])

/** Every Message accepted by the shared Instant counter Program. */
export type Message = typeof Message.Type

export {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
} from 'counter-core-example'
