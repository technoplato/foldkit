import { Option, Schema } from 'effect'

import { CapabilityId } from './processor.js'

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const Sha256Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u))

/** The capability for transcribing one complete audio artifact. */
export const FiniteTranscriptionCapabilityId = CapabilityId.make([
  'Audio',
  'Speech',
  'Transcribe',
])

/** The capability for identifying speaker turns in complete audio. */
export const DiarizationCapabilityId = CapabilityId.make([
  'Audio',
  'Speech',
  'Diarize',
])

/** The capability for identifying recorded music in complete audio. */
export const MusicIdentificationCapabilityId = CapabilityId.make([
  'Audio',
  'Music',
  'Identify',
])

/** The capability for resolving lyrics from identified music. */
export const LyricsResolutionCapabilityId = CapabilityId.make([
  'Music',
  'Lyrics',
  'Resolve',
])

/** The capability for classifying sounds in complete audio. */
export const SoundClassificationCapabilityId = CapabilityId.make([
  'Audio',
  'Sound',
  'Classify',
])

/** The capability for translating a finite text artifact. */
export const TranslationCapabilityId = CapabilityId.make([
  'Language',
  'Text',
  'Translate',
])

/** The capability for extracting provider-neutral acoustic measurements. */
export const AcousticAnalysisCapabilityId = CapabilityId.make([
  'Audio',
  'Acoustics',
  'Analyze',
])

const ArtifactIdentity = {
  artifactId: Schema.NonEmptyString,
  contentSha256: Sha256Digest,
  mediaType: Schema.NonEmptyString,
  byteLength: NonNegativeInteger,
}

/** An immutable content-addressed artifact shared within one Program session. */
export const SharedArtifactReference = Schema.TaggedStruct('SharedArtifact', {
  ...ArtifactIdentity,
  programId: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
})

/** An immutable content-addressed artifact shared within one Program session. */
export type SharedArtifactReference = typeof SharedArtifactReference.Type

/** An immutable content-addressed artifact available only on one Client. */
export const LocalArtifactReference = Schema.TaggedStruct('LocalArtifact', {
  ...ArtifactIdentity,
  clientId: Schema.NonEmptyString,
  deviceId: Schema.NonEmptyString,
})

/** An immutable content-addressed artifact available only on one Client. */
export type LocalArtifactReference = typeof LocalArtifactReference.Type

/** A shared or Client-local immutable artifact reference. */
export const ArtifactReference = Schema.Union([
  SharedArtifactReference,
  LocalArtifactReference,
])

/** A shared or Client-local immutable artifact reference. */
export type ArtifactReference = typeof ArtifactReference.Type

/** Sanitized failure categories safe to preserve in Messages and replay. */
export const AudioProcessingFailureCode = Schema.Literals([
  'ArtifactUnavailable',
  'InvalidInput',
  'UnsupportedMedia',
  'UnsupportedLanguage',
  'PermissionDenied',
  'RateLimited',
  'TimedOut',
  'ProcessingFailed',
])

/** Sanitized failure categories safe to preserve in Messages and replay. */
export type AudioProcessingFailureCode = typeof AudioProcessingFailureCode.Type

/**
 * A provider-neutral failure without credentials, raw provider payloads, or
 * host error objects.
 */
export const AudioProcessingFailure = Schema.TaggedStruct(
  'FailedAudioProcessing',
  {
    code: AudioProcessingFailureCode,
    isRetryable: Schema.Boolean,
  },
)

/**
 * A provider-neutral failure without credentials, raw provider payloads, or
 * host error objects.
 */
export type AudioProcessingFailure = typeof AudioProcessingFailure.Type

/** Portable arguments for transcribing one complete audio artifact. */
export const FiniteTranscriptionArguments = Schema.Struct({
  audio: ArtifactReference,
  languageHints: Schema.Array(Schema.String),
  includesWordTimestamps: Schema.Boolean,
})

/** Portable arguments for transcribing one complete audio artifact. */
export type FiniteTranscriptionArguments =
  typeof FiniteTranscriptionArguments.Type

/** A completed finite transcription represented by an immutable artifact. */
export const SucceededFiniteTranscription = Schema.TaggedStruct(
  'SucceededFiniteTranscription',
  {
    transcript: ArtifactReference,
    detectedLanguage: Schema.OptionFromNullOr(Schema.String),
  },
)

/** A completed finite transcription represented by an immutable artifact. */
export type SucceededFiniteTranscription =
  typeof SucceededFiniteTranscription.Type

/** The portable success or sanitized failure of finite transcription. */
export const FiniteTranscriptionOutcome = Schema.Union([
  SucceededFiniteTranscription,
  AudioProcessingFailure,
])

/** The portable success or sanitized failure of finite transcription. */
export type FiniteTranscriptionOutcome = typeof FiniteTranscriptionOutcome.Type

/** Portable arguments for identifying speakers in complete audio. */
export const DiarizationArguments = Schema.Struct({
  audio: ArtifactReference,
  minimumSpeakerCount: Schema.OptionFromNullOr(PositiveInteger),
  maximumSpeakerCount: Schema.OptionFromNullOr(PositiveInteger),
}).check(
  Schema.makeFilter(request => {
    if (
      Option.isSome(request.minimumSpeakerCount) &&
      Option.isSome(request.maximumSpeakerCount) &&
      request.minimumSpeakerCount.value > request.maximumSpeakerCount.value
    ) {
      return {
        path: ['maximumSpeakerCount'],
        issue:
          'maximumSpeakerCount must be greater than or equal to minimumSpeakerCount',
      }
    }
    return undefined
  }),
)

/** Portable arguments for identifying speakers in complete audio. */
export type DiarizationArguments = typeof DiarizationArguments.Type

/** Completed speaker diarization represented by an immutable timeline. */
export const SucceededDiarization = Schema.TaggedStruct(
  'SucceededDiarization',
  {
    speakerTimeline: ArtifactReference,
    speakerCount: NonNegativeInteger,
  },
)

/** Completed speaker diarization represented by an immutable timeline. */
export type SucceededDiarization = typeof SucceededDiarization.Type

/** The portable success or sanitized failure of speaker diarization. */
export const DiarizationOutcome = Schema.Union([
  SucceededDiarization,
  AudioProcessingFailure,
])

/** The portable success or sanitized failure of speaker diarization. */
export type DiarizationOutcome = typeof DiarizationOutcome.Type

/** Portable arguments for identifying music in complete audio. */
export const MusicIdentificationArguments = Schema.Struct({
  audio: ArtifactReference,
})

/** Portable arguments for identifying music in complete audio. */
export type MusicIdentificationArguments =
  typeof MusicIdentificationArguments.Type

/** Completed music identification represented by immutable structured matches. */
export const SucceededMusicIdentification = Schema.TaggedStruct(
  'SucceededMusicIdentification',
  {
    matches: ArtifactReference,
  },
)

/** Completed music identification represented by immutable structured matches. */
export type SucceededMusicIdentification =
  typeof SucceededMusicIdentification.Type

/** The portable success or sanitized failure of music identification. */
export const MusicIdentificationOutcome = Schema.Union([
  SucceededMusicIdentification,
  AudioProcessingFailure,
])

/** The portable success or sanitized failure of music identification. */
export type MusicIdentificationOutcome = typeof MusicIdentificationOutcome.Type

/** Portable arguments for resolving lyrics from identified music. */
export const LyricsResolutionArguments = Schema.Struct({
  musicMatches: ArtifactReference,
  languageHints: Schema.Array(Schema.String),
})

/** Portable arguments for resolving lyrics from identified music. */
export type LyricsResolutionArguments = typeof LyricsResolutionArguments.Type

/** Resolved lyrics represented by an immutable text or timed-text artifact. */
export const SucceededLyricsResolution = Schema.TaggedStruct(
  'SucceededLyricsResolution',
  {
    lyrics: ArtifactReference,
    isTimeSynchronized: Schema.Boolean,
  },
)

/** Resolved lyrics represented by an immutable text or timed-text artifact. */
export type SucceededLyricsResolution = typeof SucceededLyricsResolution.Type

/** The portable success or sanitized failure of lyrics resolution. */
export const LyricsResolutionOutcome = Schema.Union([
  SucceededLyricsResolution,
  AudioProcessingFailure,
])

/** The portable success or sanitized failure of lyrics resolution. */
export type LyricsResolutionOutcome = typeof LyricsResolutionOutcome.Type

/** Portable arguments for classifying sounds in complete audio. */
export const SoundClassificationArguments = Schema.Struct({
  audio: ArtifactReference,
  taxonomy: Schema.OptionFromNullOr(Schema.String),
})

/** Portable arguments for classifying sounds in complete audio. */
export type SoundClassificationArguments =
  typeof SoundClassificationArguments.Type

/** Completed sound classification represented by an immutable timeline. */
export const SucceededSoundClassification = Schema.TaggedStruct(
  'SucceededSoundClassification',
  {
    classifications: ArtifactReference,
  },
)

/** Completed sound classification represented by an immutable timeline. */
export type SucceededSoundClassification =
  typeof SucceededSoundClassification.Type

/** The portable success or sanitized failure of sound classification. */
export const SoundClassificationOutcome = Schema.Union([
  SucceededSoundClassification,
  AudioProcessingFailure,
])

/** The portable success or sanitized failure of sound classification. */
export type SoundClassificationOutcome = typeof SoundClassificationOutcome.Type

/** Portable arguments for translating one finite text artifact. */
export const TranslationArguments = Schema.Struct({
  sourceText: ArtifactReference,
  sourceLanguage: Schema.OptionFromNullOr(Schema.String),
  targetLanguage: Schema.String,
})

/** Portable arguments for translating one finite text artifact. */
export type TranslationArguments = typeof TranslationArguments.Type

/** Completed translation represented by one immutable text artifact. */
export const SucceededTranslation = Schema.TaggedStruct(
  'SucceededTranslation',
  {
    translatedText: ArtifactReference,
    detectedSourceLanguage: Schema.OptionFromNullOr(Schema.String),
  },
)

/** Completed translation represented by one immutable text artifact. */
export type SucceededTranslation = typeof SucceededTranslation.Type

/** The portable success or sanitized failure of translation. */
export const TranslationOutcome = Schema.Union([
  SucceededTranslation,
  AudioProcessingFailure,
])

/** The portable success or sanitized failure of translation. */
export type TranslationOutcome = typeof TranslationOutcome.Type

/** Portable arguments for analyzing complete audio acoustics. */
export const AcousticAnalysisArguments = Schema.Struct({
  audio: ArtifactReference,
  measurements: Schema.NonEmptyArray(Schema.String),
})

/** Portable arguments for analyzing complete audio acoustics. */
export type AcousticAnalysisArguments = typeof AcousticAnalysisArguments.Type

/** Completed acoustic analysis represented by an immutable measurements artifact. */
export const SucceededAcousticAnalysis = Schema.TaggedStruct(
  'SucceededAcousticAnalysis',
  {
    analysis: ArtifactReference,
  },
)

/** Completed acoustic analysis represented by an immutable measurements artifact. */
export type SucceededAcousticAnalysis = typeof SucceededAcousticAnalysis.Type

/** The portable success or sanitized failure of acoustic analysis. */
export const AcousticAnalysisOutcome = Schema.Union([
  SucceededAcousticAnalysis,
  AudioProcessingFailure,
])

/** The portable success or sanitized failure of acoustic analysis. */
export type AcousticAnalysisOutcome = typeof AcousticAnalysisOutcome.Type
