import { Array, Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  attachmentIDOf,
  audioStoragePathOf,
  lifecycleIDOf,
  segmentIDOf,
  sha1,
  transcriptionIDOf,
  uuidV5,
} from './ids.js'

const hexOf = (bytes: Uint8Array): string =>
  Array.join(
    Array.map(Array.fromIterable(bytes), byte =>
      byte.toString(16).padStart(2, '0'),
    ),
    '',
  )

const recordingID = '11111111-2222-3333-4444-555555555555'

describe('sha1', () => {
  it('matches the FIPS 180 test vectors, across block boundaries', () => {
    expect(hexOf(sha1(new TextEncoder().encode('abc')))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    )
    expect(hexOf(sha1(new TextEncoder().encode('a'.repeat(1000))))).toBe(
      '291e9a6c66994949b57ba5e650361e98fc36b1ba',
    )
  })
})

describe('ids the iPhone and the web share', () => {
  it('derives RFC 4122 version 5 UUIDs', () => {
    expect(
      uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com'),
    ).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
  })

  it('derives the transcription id the way the iPhone does', () => {
    expect(
      transcriptionIDOf(recordingID, 'Deepgram', 'default', {
        sampleRate: 48_000,
        channels: 1,
        language: 'en',
        diarizationEnabled: true,
      }),
    ).toBe('c99cc20b-5b66-500c-ab18-a311edcb21dc')
    expect(
      transcriptionIDOf(recordingID.toUpperCase(), 'Deepgram', 'default', {
        sampleRate: 16_000,
        channels: 1,
        language: 'en',
        diarizationEnabled: true,
      }),
    ).toBe('2e5c2278-3e42-54e4-a7c7-d6e7c3955cab')
  })

  it('gives a web section the same id for the same recording and index', () => {
    expect(segmentIDOf(recordingID, 0)).toBe(
      '3b7b58f1-de22-5551-b7aa-74b2fe26074e',
    )
    expect(segmentIDOf(recordingID, 1)).not.toBe(segmentIDOf(recordingID, 0))
  })

  it("matches the iPhone's golden attachment id and names the audio like the iPhone", async () => {
    const lifecycleID = lifecycleIDOf(recordingID, 1_234_567.6)
    expect(lifecycleID).toBe('v1:11111111-2222-3333-4444-555555555555:1234568')
    expect(
      await Effect.runPromise(
        attachmentIDOf(
          lifecycleID,
          'image',
          'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
        ),
      ),
    ).toBe('0c36e3b7-3bfc-494c-9d06-e393e71086c1')
    expect(
      await Effect.runPromise(attachmentIDOf(lifecycleID, 'audio', 'audio')),
    ).toBe('c3bdc945-e58d-403c-9479-af4459c21518')
    expect(audioStoragePathOf(recordingID, 1_234_567.6)).toBe(
      'scribe/11111111-2222-3333-4444-555555555555/generation-1234568/audio.wav',
    )
  })
})
