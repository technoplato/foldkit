import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { WordsDataClient, makeWordsDataClient } from './dataClient.js'
import { RecordingSegmentRoute } from './route.js'
import { FetchWordsData } from './update.js'

const route = RecordingSegmentRoute.make({
  recordingID: 'recording-123',
  segmentRangeID: 'segment-range-456',
})
const validPayload = {
  version: 1,
  recordingID: route.recordingID,
  segmentRangeID: route.segmentRangeID,
  range: {
    firstSegmentID: 'segment-a',
    lastSegmentID: 'segment-b',
  },
  words: [
    { id: 'word-1', text: 'typed', start: 0, end: 1 },
    { id: 'word-2', text: 'words', start: 1, end: 2, speaker: 2 },
  ],
  audio: { url: '/audio.wav', duration: 2, mimeType: 'audio/wav' },
}

describe('WordsDataClient', () => {
  it('fetches and decodes the route-local version 1 payload', async () => {
    let requestedURL = ''
    const client = makeWordsDataClient(input => {
      requestedURL = input.toString()
      return Promise.resolve(
        new Response(JSON.stringify(validPayload), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
    })

    const data = await Effect.runPromise(client.fetch(route))

    expect(requestedURL).toBe('/recording-123/segment-range-456/data.json')
    expect(data.words.map(word => word.id)).toEqual(['word-1', 'word-2'])
  })

  it.each([
    {
      expectedFailure: 'HttpWordsDataFailure',
      response: new Response('missing', { status: 404 }),
    },
    {
      expectedFailure: 'InvalidWordsDataFailure',
      response: new Response(JSON.stringify({ ...validPayload, version: 2 }), {
        status: 200,
      }),
    },
    {
      expectedFailure: 'MismatchedWordsDataFailure',
      response: new Response(
        JSON.stringify({ ...validPayload, recordingID: 'another-recording' }),
        { status: 200 },
      ),
    },
  ])(
    'returns $expectedFailure through the typed fetch Command',
    async ({ expectedFailure, response }) => {
      const client = makeWordsDataClient(() => Promise.resolve(response))
      const message = await Effect.runPromise(
        FetchWordsData({ route }).effect.pipe(
          Effect.provideService(WordsDataClient, client),
        ),
      )

      expect(message).toMatchObject({
        _tag: 'FailedFetchWordsData',
        failure: { _tag: expectedFailure },
        route,
      })
    },
  )
})
