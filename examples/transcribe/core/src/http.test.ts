import { describe, expect, test } from 'vitest'

import {
  createJobRegistry,
  handleTranscribeRequest,
  jobFromArtifacts,
  wordsFromWhisper,
} from './http.js'

const SEED_ID = 'B0FaK0sazXg'
const SEED_URL = 'https://youtu.be/B0FaK0sazXg'

const seed = jobFromArtifacts({
  frames: ['scene_000001.jpg'],
  id: SEED_ID,
  title: 'Recorded session',
  url: SEED_URL,
  vtt: `WEBVTT

00:00:00.640 --> 00:00:04.150
Okay. So, I'm recording on both screens
`,
})

const registry = () => createJobRegistry([seed])

describe('GET contract', () => {
  test('healthz returns ok', () => {
    const response = handleTranscribeRequest(
      { accept: '*/*', method: 'GET', url: '/healthz' },
      registry(),
    )
    expect(response?.status).toBe(200)
    expect(response?.body).toContain('"status":"ok"')
  })

  test('GET / without url falls through', () => {
    const response = handleTranscribeRequest(
      { accept: 'text/html', method: 'GET', url: '/' },
      registry(),
    )
    expect(response).toBeUndefined()
  })

  test('GET /?url= redirects to the seed job', () => {
    const response = handleTranscribeRequest(
      {
        accept: 'text/html',
        method: 'GET',
        url: `/?url=${encodeURIComponent(SEED_URL)}`,
      },
      registry(),
    )
    expect(response?.status).toBe(302)
    expect(response?.headers.location).toBe(`/jobs/${SEED_ID}`)
  })

  test('equivalent YouTube URLs do not spawn duplicate jobs', () => {
    const jobs = registry()
    const first = handleTranscribeRequest(
      {
        accept: 'application/json',
        method: 'GET',
        url: `/?url=${encodeURIComponent(SEED_URL)}`,
      },
      jobs,
    )
    const second = handleTranscribeRequest(
      {
        accept: 'application/json',
        method: 'GET',
        url: '/?url=https://www.youtube.com/watch?v=B0FaK0sazXg',
      },
      jobs,
    )
    expect(JSON.parse(first?.body ?? '{}').created).toBe(false)
    expect(JSON.parse(second?.body ?? '{}').created).toBe(false)
    expect(JSON.parse(second?.body ?? '{}').id).toBe(SEED_ID)
  })

  test('GET /jobs/:id returns transcript, frames, and analysis', () => {
    const response = handleTranscribeRequest(
      { accept: 'application/json', method: 'GET', url: `/jobs/${SEED_ID}` },
      registry(),
    )
    expect(response?.status).toBe(200)
    const body = JSON.parse(response?.body ?? '{}')
    expect(body.id).toBe(SEED_ID)
    expect(body.status).toBe('running')
    expect(body.transcript.source).toBe('captions')
    expect(body.transcript.text).toContain('recording on both screens')
    expect(body.frames).toHaveLength(1)
    expect(body.analysis.summary).toContain('captions')
  })

  test('unknown job is 404', () => {
    const response = handleTranscribeRequest(
      { accept: 'application/json', method: 'GET', url: '/jobs/missingid12' },
      registry(),
    )
    expect(response?.status).toBe(404)
  })

  test('a new URL starts one queued job', () => {
    const jobs = registry()
    const first = handleTranscribeRequest(
      {
        accept: 'application/json',
        method: 'GET',
        url: '/?url=https://youtu.be/dQw4w9wgwXc',
      },
      jobs,
    )
    const second = handleTranscribeRequest(
      {
        accept: 'application/json',
        method: 'GET',
        url: '/?url=https://www.youtube.com/watch?v=dQw4w9wgwXc',
      },
      jobs,
    )
    expect(JSON.parse(first?.body ?? '{}').created).toBe(true)
    expect(JSON.parse(second?.body ?? '{}').created).toBe(false)
    expect(JSON.parse(first?.body ?? '{}').id).toBe('dQw4w9wgwXc')
    expect(jobs.getById('dQw4w9wgwXc')?.status).toBe('queued')
  })
})

describe('follow-along words', () => {
  test('maps whisper segment words in seconds', () => {
    const words = wordsFromWhisper({
      text: 'Okay so',
      segments: [
        {
          start: 0,
          end: 1.2,
          text: ' Okay so',
          words: [
            { word: ' Okay', start: 0, end: 0.4 },
            { word: ' so', start: 0.4, end: 0.9 },
          ],
        },
      ],
    })
    expect(words).toEqual([
      { id: 'w0', text: 'Okay', start: 0, end: 0.4 },
      { id: 'w1', text: 'so', start: 0.4, end: 0.9 },
    ])
  })

  test('GET /jobs JSON includes words and local media', () => {
    const job = jobFromArtifacts({
      frames: [],
      id: SEED_ID,
      title: 'Recorded session',
      url: SEED_URL,
      whisper: {
        text: 'Okay',
        segments: [{ words: [{ word: ' Okay,', start: 0, end: 0.96 }] }],
      },
    })
    const response = handleTranscribeRequest(
      { accept: 'application/json', method: 'GET', url: `/jobs/${SEED_ID}` },
      createJobRegistry([job]),
    )
    const body = JSON.parse(response?.body ?? '{}')
    expect(body.words).toHaveLength(1)
    expect(body.words[0]).toEqual({
      id: 'w0',
      text: 'Okay,',
      start: 0,
      end: 0.96,
    })
    expect(body.mediaUrl).toBe(`/media/${SEED_ID}.mp4`)
    expect(body.fallbackUrl).toBe(SEED_URL)
  })

  test('HTML GET /jobs falls through to the Foldkit page', () => {
    const response = handleTranscribeRequest(
      { accept: 'text/html', method: 'GET', url: `/jobs/${SEED_ID}` },
      registry(),
    )
    expect(response).toBeUndefined()
  })
})
