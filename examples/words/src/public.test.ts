import { describe, expect, it, vi } from 'vitest'

import { mountWordsExample } from './public.js'

const payload = {
  version: 1,
  recordingID: 'recording-123',
  segmentRangeID: 'segment-range-456',
  range: {
    firstSegmentID: 'segment-a',
    lastSegmentID: 'segment-b',
  },
  words: [
    { id: 'word-1', text: 'Read', start: 0, end: 0.8 },
    { id: 'word-2', text: 'along', start: 0.8, end: 1.5 },
  ],
  audio: { url: '/audio.wav', duration: 2, mimeType: 'audio/wav' },
}

describe('mountWordsExample', () => {
  it('mounts a validated payload over the native root', async () => {
    const root = document.createElement('div')
    const audio = document.createElement('audio')
    const nonceSource = document.createElement('script')
    nonceSource.setAttribute('nonce', 'test-nonce')
    document.head.append(nonceSource)
    root.textContent = 'Native transcript fallback'

    const isMounted = mountWordsExample({ root, audio, payload })
    nonceSource.remove()

    expect(isMounted).toBe(true)
    expect(audio.getAttribute('src')).toBe('/audio.wav')
    expect(root.querySelector('style')?.getAttribute('nonce')).toBe(
      'test-nonce',
    )
    await vi.waitFor(() => {
      expect(root.textContent).toContain('Read')
      expect(root.textContent).toContain('along')
    })
  })

  it.each([
    { ...payload, version: 2 },
    { ...payload, segmentRangeID: undefined },
    { ...payload, range: undefined },
    {
      ...payload,
      audio: { ...payload.audio, url: 'https://example.com/a.wav' },
    },
    {
      ...payload,
      words: [
        { id: 'word-1', text: 'later', start: 2, end: 3 },
        { id: 'word-2', text: 'earlier', start: 1, end: 1.5 },
      ],
    },
    {
      ...payload,
      words: [{ id: 'word-1', text: 'zero', start: 1, end: 1 }],
    },
  ])('returns false and preserves native fallback for %#', invalidPayload => {
    const root = document.createElement('div')
    const fallback = document.createElement('p')
    const audio = document.createElement('audio')
    fallback.textContent = 'Native transcript fallback'
    root.append(fallback)

    expect(mountWordsExample({ root, audio, payload: invalidPayload })).toBe(
      false,
    )
    expect(root.firstElementChild).toBe(fallback)
    expect(root.textContent).toBe('Native transcript fallback')
  })
})
