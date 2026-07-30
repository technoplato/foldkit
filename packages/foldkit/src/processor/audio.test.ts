import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AcousticAnalysisArguments,
  AcousticAnalysisCapabilityId,
  AcousticAnalysisOutcome,
  ArtifactReference,
  AudioProcessingFailure,
  DiarizationArguments,
  DiarizationCapabilityId,
  DiarizationOutcome,
  FiniteTranscriptionArguments,
  FiniteTranscriptionCapabilityId,
  FiniteTranscriptionOutcome,
  LocalArtifactReference,
  LyricsResolutionArguments,
  LyricsResolutionCapabilityId,
  LyricsResolutionOutcome,
  MusicIdentificationArguments,
  MusicIdentificationCapabilityId,
  MusicIdentificationOutcome,
  SharedArtifactReference,
  SoundClassificationArguments,
  SoundClassificationCapabilityId,
  SoundClassificationOutcome,
  TranslationArguments,
  TranslationCapabilityId,
  TranslationOutcome,
} from './audio.js'

const audio = SharedArtifactReference.make({
  _tag: 'SharedArtifact',
  artifactId: 'artifact-audio',
  programId: 'scribe',
  sessionId: 'session-user-1',
  contentSha256: 'a'.repeat(64),
  mediaType: 'audio/wav',
  byteLength: 4096,
})

const localResult = LocalArtifactReference.make({
  _tag: 'LocalArtifact',
  artifactId: 'artifact-result',
  clientId: 'client-phone',
  deviceId: 'device-phone',
  contentSha256: 'b'.repeat(64),
  mediaType: 'application/json',
  byteLength: 1024,
})

const expectPortable = <Type, Encoded>(
  schema: Schema.Codec<Type, Encoded, never, never>,
  value: unknown,
): void => {
  expect(() => Schema.decodeUnknownSync(schema)(value)).not.toThrow()
}

describe('Audio Processor capabilities', () => {
  it('uses semantic provider-neutral identifiers independent of execution finiteness', () => {
    const identifiers = [
      FiniteTranscriptionCapabilityId,
      DiarizationCapabilityId,
      MusicIdentificationCapabilityId,
      LyricsResolutionCapabilityId,
      SoundClassificationCapabilityId,
      TranslationCapabilityId,
      AcousticAnalysisCapabilityId,
    ]

    expect(
      new Set(identifiers.map(identifier => identifier.join('/'))).size,
    ).toBe(7)
    expect(identifiers).toStrictEqual([
      ['Audio', 'Speech', 'Transcribe'],
      ['Audio', 'Speech', 'Diarize'],
      ['Audio', 'Music', 'Identify'],
      ['Music', 'Lyrics', 'Resolve'],
      ['Audio', 'Sound', 'Classify'],
      ['Language', 'Text', 'Translate'],
      ['Audio', 'Acoustics', 'Analyze'],
    ])
  })

  it('round trips immutable shared and local artifact references', () => {
    expect(
      Schema.decodeUnknownSync(ArtifactReference)(
        Schema.encodeSync(ArtifactReference)(audio),
      ),
    ).toStrictEqual(audio)
    expect(
      Schema.decodeUnknownSync(ArtifactReference)(
        Schema.encodeSync(ArtifactReference)(localResult),
      ),
    ).toStrictEqual(localResult)
    expect(() =>
      Schema.decodeUnknownSync(ArtifactReference)({
        ...Schema.encodeSync(ArtifactReference)(audio),
        contentSha256: 'mutable-location',
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(SharedArtifactReference)({
        ...Schema.encodeSync(SharedArtifactReference)(audio),
        sessionId: '',
      }),
    ).toThrow()
  })

  it('models finite transcription with artifact inputs and outputs', () => {
    expectPortable(FiniteTranscriptionArguments, {
      audio,
      languageHints: ['en-US'],
      includesWordTimestamps: true,
    })
    expectPortable(FiniteTranscriptionOutcome, {
      _tag: 'SucceededFiniteTranscription',
      transcript: localResult,
      detectedLanguage: 'en-US',
    })
  })

  it('models speaker diarization with an immutable speaker timeline', () => {
    expectPortable(DiarizationArguments, {
      audio,
      minimumSpeakerCount: 1,
      maximumSpeakerCount: 4,
    })
    expectPortable(DiarizationOutcome, {
      _tag: 'SucceededDiarization',
      speakerTimeline: localResult,
      speakerCount: 2,
    })
    expect(() =>
      Schema.decodeUnknownSync(DiarizationArguments)({
        audio,
        minimumSpeakerCount: 4,
        maximumSpeakerCount: 1,
      }),
    ).toThrow()
  })

  it('models music identification with immutable structured matches', () => {
    expectPortable(MusicIdentificationArguments, { audio })
    expectPortable(MusicIdentificationOutcome, {
      _tag: 'SucceededMusicIdentification',
      matches: localResult,
    })
  })

  it('models lyrics resolution independently from music identification', () => {
    expectPortable(LyricsResolutionArguments, {
      musicMatches: localResult,
      languageHints: ['en'],
    })
    expectPortable(LyricsResolutionOutcome, {
      _tag: 'SucceededLyricsResolution',
      lyrics: localResult,
      isTimeSynchronized: true,
    })
  })

  it('models finite environmental sound classification', () => {
    expectPortable(SoundClassificationArguments, {
      audio,
      taxonomy: 'AppleSoundAnalysis',
    })
    expectPortable(SoundClassificationOutcome, {
      _tag: 'SucceededSoundClassification',
      classifications: localResult,
    })
  })

  it('models translation over an immutable finite text artifact', () => {
    expectPortable(TranslationArguments, {
      sourceText: localResult,
      sourceLanguage: null,
      targetLanguage: 'es',
    })
    expectPortable(TranslationOutcome, {
      _tag: 'SucceededTranslation',
      translatedText: localResult,
      detectedSourceLanguage: 'en',
    })
  })

  it('models provider-neutral acoustic measurements', () => {
    expectPortable(AcousticAnalysisArguments, {
      audio,
      measurements: ['Loudness', 'Tempo', 'Pitch'],
    })
    expectPortable(AcousticAnalysisOutcome, {
      _tag: 'SucceededAcousticAnalysis',
      analysis: localResult,
    })
  })

  it('limits portable failures to sanitized fields', () => {
    const failure = Schema.decodeUnknownSync(AudioProcessingFailure)({
      _tag: 'FailedAudioProcessing',
      code: 'RateLimited',
      isRetryable: true,
      providerCredential: 'must-not-survive',
      providerMessage: 'The service exposed a credential in this detail',
      rawResponse: {
        secret: 'must-not-survive',
      },
    })

    expect(Schema.encodeSync(AudioProcessingFailure)(failure)).toStrictEqual({
      _tag: 'FailedAudioProcessing',
      code: 'RateLimited',
      isRetryable: true,
    })
  })
})
